// Enrollment automation, capacity, attendance, recordings, reminders and at-risk alerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

test('a repeated payment notification never creates a second enrollment', async () => {
  const h = await freshDb();
  const s = await h.user('pay@test.io');
  const e1 = await h.one(h.service, `select enroll_student($1, 'c-py', '2026-11-02', 'payment', 'pay_123')`, [s]);
  const e2 = await h.one(h.service, `select enroll_student($1, 'c-py', '2026-11-02', 'payment', 'pay_123')`, [s]);
  assert.equal(e1, e2);
  assert.equal(await h.one(h.sql, `select count(*)::int from enrollments where student_id = $1`, [s]), 1);
  assert.equal(await h.one(h.as(s), `select count(*)::int from notifications where kind = 'welcome'`), 1);
});

test('without a date, students join the next batch whose applications are still open', async () => {
  const h = await freshDb();
  const s = await h.user('next@test.io');
  await h.service(`select enroll_student($1, 'c-genai')`, [s]);
  const row = (await h.sql(`select b.starts_on::text d, extract(isodow from b.starts_on)::int dow,
                                   extract(day from b.starts_on)::int dom, (b.starts_on - 7 >= current_date) open
                            from enrollments e join batches b on b.id = e.batch_id where e.student_id = $1`, [s])).rows[0];
  assert.equal(row.dow, 1, 'a Monday');
  assert.ok(row.dom <= 7, 'the first Monday of its month');
  assert.equal(row.open, true);
  assert.equal(row.d, await h.one(h.sql, `select next_start_date()::text`));
});

test('one active enrollment per program; a full batch refuses new students', async () => {
  const h = await freshDb();
  const s = await h.user('twice@test.io');
  await h.service(`select enroll_student($1, 'bs-ds', '2026-10-05')`, [s]);
  await rejects(h.service(`select enroll_student($1, 'bs-ds', '2026-11-02')`, [s]), 'already actively enrolled');

  await h.sql(`update programs set capacity = 2 where id = 'c-genai'`);
  for (const email of ['a@t.io', 'b@t.io']) await h.service(`select enroll_student($1, 'c-genai', '2026-11-02')`, [await h.user(email)]);
  await rejects(h.service(`select enroll_student($1, 'c-genai', '2026-11-02')`, [await h.user('c@t.io')]), 'is full');
});

test('admins enroll by email; unknown emails are reported clearly', async () => {
  const h = await freshDb();
  const admin = await h.user('admin@test.io', 'admin');
  const s = await h.user('Student@Test.io');
  const e = await h.one(h.as(admin), `select admin_enroll('student@test.io', 'ms-aml', '2026-11-02')`);
  assert.equal(await h.one(h.sql, `select student_id::text from enrollments where id = $1`, [e]), s);
  await rejects(h.as(admin)(`select admin_enroll('nobody@test.io', 'ms-aml', '2026-11-02')`), 'No account');
});

test('Jitsi attendance is recorded for enrolled students only and adds up across rejoins', async () => {
  const h = await freshDb();
  const bid = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  const inBatch = await h.user('in@test.io');
  const outsider = await h.user('out@test.io');
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [inBatch]);
  const sess = await h.one(h.sql, `select id from sessions where batch_id = $1 order by starts_at limit 1`, [bid]);
  assert.equal(await h.one(h.service, `select record_attendance($1, 'IN@test.io', '2026-10-06 13:30Z', '2026-10-06 14:00Z')`, [sess]), true);
  assert.equal(await h.one(h.service, `select record_attendance($1, 'in@test.io', '2026-10-06 14:05Z', '2026-10-06 14:25Z')`, [sess]), true);
  assert.equal(await h.one(h.service, `select record_attendance($1, 'out@test.io', '2026-10-06 13:30Z', '2026-10-06 14:30Z')`, [sess]), false);
  assert.equal(await h.one(h.sql, `select minutes from attendance where session_id = $1 and student_id = $2`, [sess, inBatch]), 50);
  assert.equal(await h.one(h.sql, `select count(*)::int from attendance where student_id = $1`, [outsider]), 0);
  await rejects(h.as(inBatch)(`select record_attendance($1, 'in@test.io', now(), now())`, [sess]), '42501');
});

test('a new recording notifies everyone in the batch once and shows on their dashboard', async () => {
  const h = await freshDb();
  const bid = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  const s1 = await h.user('s1@test.io'); const s2 = await h.user('s2@test.io');
  for (const s of [s1, s2]) await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [s]);
  const sess = await h.one(h.sql, `select id from sessions where batch_id = $1 order by starts_at limit 1`, [bid]);
  assert.equal(await h.one(h.service, `select attach_recording($1, 'vid_abc123')`, [sess]), 2);
  assert.equal(await h.one(h.service, `select attach_recording($1, 'vid_abc123')`, [sess]), 0, 'no duplicate alerts');
  const dash = await h.one(h.as(s1), `select my_dashboard()`);
  assert.equal(dash.batches[0].recordings, 1);
});

test('class reminders go to enrolled students once per class', async () => {
  const h = await freshDb();
  const bid = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  const s1 = await h.user('r1@test.io'); const s2 = await h.user('r2@test.io');
  for (const s of [s1, s2]) await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [s]);
  // Two hours before the first class (Tue Oct 6, 13:30 UTC): exactly one class is within 24 hours.
  assert.equal(await h.one(h.service, `select queue_session_reminders(24, '2026-10-06 11:30Z')`), 2);
  assert.equal(await h.one(h.service, `select queue_session_reminders(24, '2026-10-06 11:30Z')`), 0);
  assert.match(await h.one(h.as(s1), `select body from notifications where kind = 'reminder_24h'`), /Tue Oct 06, 19:00 \(Asia\/Kolkata\)/);
});

test('inactive students are flagged to staff, never visible to students', async () => {
  const h = await freshDb();
  const admin = await h.user('admin@test.io', 'admin');
  const quiet = await h.user('quiet@test.io'); const busy = await h.user('busy@test.io');
  for (const s of [quiet, busy]) await h.service(`select enroll_student($1, 'bs-ds', '2026-10-05')`, [s]);
  await h.sql(`update profiles set last_active_at = '2026-10-01Z' where id = $1`, [quiet]);
  await h.sql(`update profiles set last_active_at = '2026-10-20Z' where id = $1`, [busy]);
  const flagged = (await h.as(admin)(`select email, days_inactive from staff_at_risk(14, '2026-10-25Z')`)).rows;
  assert.deepEqual(flagged.map((r) => r.email), ['quiet@test.io']);
  assert.equal(flagged[0].days_inactive, 24);
  await rejects(h.as(quiet)(`select * from staff_at_risk()`), 'Staff only');
});

