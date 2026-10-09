// Unpaid tuition and portal access (owner decision, 2026-10-03). Each enrollment is one 12-week term. Access is
// open while the term is paid, or for 30 days from the term's start (or from enrolling, if later); then it
// stops, by the database clock, everywhere a student's access is checked. Admins can stop access, start it
// (optionally until a date) or return it to automatic. The hourly job records each stop and restore and
// sends the reminders and notices exactly once. Times are relative to now(), and the 30-day boundary is
// checked at the exact instant inside one transaction (where now() stands still).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, admin, admin2, inst, B, lesson, task, other;

// A Monday about ten weeks ago: the batch is still running, and its 30 days are long over.
const PAST_MONDAY = `(current_date - 70 - (extract(isodow from current_date - 70)::int - 1))`;
const enroll = async (h, email, batchStart = null, program = 'ms-ds') => {
  const id = await h.user(email);
  const eid = await h.one(h.service, `select enroll_student($1, $2, ${batchStart ?? PAST_MONDAY})`, [id, program]);
  return { id, eid };
};
// When the enrollment was created (the batch started long before, so this decides the 30 days).
const joined = (eid, ago) => h.sql(`update enrollments set enrolled_at = now() - $2::interval where id = $1`, [eid, ago]);
const access = async (who) => (await h.one(h.as(who.id), `select my_dashboard()`)).access.find((a) => a.enrollment_id === who.eid);
const sees = async (who, batch = B) => (await h.one(h.as(who.id), `select can_see_batch($1)`, [batch]));
const pay = (who, amount = 2450, method = 'bank_transfer', reference = null) =>
  h.one(h.as(admin), `select admin_record_payment($1, $2, $3, $4)`, [who.eid, amount, method, reference]);
const setAccess = (who, mode, reason = null, until = null) =>
  h.one(h.as(admin), `select admin_set_access($1, $2, $3, $4::timestamptz)`, [who.eid, mode, reason, until]);
const notes = async (user, kind) => (await h.sql(`select kind, title, body from notifications where user_id = $1 and kind like $2 order by created_at, id`,
                                                 [user, kind ?? 'access%'])).rows;
// Run `setup` as the owner and then `sql` as the signed-in user, in ONE transaction: now() is the same instant
// for both, so "exactly 30 days" can be checked exactly. Rolled back afterwards.
const atOneInstant = async (user, setup, setupParams, sql, params = []) => {
  let out;
  await h.db.transaction(async (tx) => {
    await tx.query(setup, setupParams);
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
    out = (await tx.query(sql, params)).rows[0];
    await tx.rollback();
  }).catch((e) => { if (!/rollback/i.test(String(e?.message))) throw e; });
  return out;
};

before(async () => {
  h = await freshDb();
  admin = await h.user('admin@test.io', 'admin', 'Ada Admin');
  admin2 = await h.user('admin2@test.io', 'admin', 'Second Admin');
  inst = await h.user('inst@test.io', 'instructor');
  B = await h.one(h.service, `select create_batch('ms-ds', ${PAST_MONDAY}, 1)`);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [B, inst]);
  await h.service(`select update_batch_statuses(current_date)`);
  lesson = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'ms-ds' and m.term_no = 1
                               order by l.position limit 1`);
  task = await h.one(h.sql, `select id from batch_assignments where batch_id = $1 order by due_at desc limit 1`, [B]);
  await h.service(`insert into materials (program_id, lesson_id, title, file_path) values ('ms-ds', $1, 'Notes', 'ms-ds/t1/notes.pdf')`, [lesson]);
  await h.service(`insert into storage.objects (bucket_id, name) values ('course-files', 'ms-ds/t1/notes.pdf')`);
  // A class happening right now, with its link.
  await h.sql(`update sessions set starts_at = now() - interval '5 minutes', ends_at = now() + interval '55 minutes', join_url = 'https://Jitsi.us/j/1'
               where id = (select id from sessions where batch_id = $1 order by starts_at desc limit 1)`, [B]);
  other = await enroll(h, 'other@test.io');
});

test('the rule itself, at exact instants: status first, then the manual setting, then payment, then 30 days', async () => {
  const rule = (status, mode, until, paid, offset) => h.one(h.sql,
    `select access_rule($1, $2, $3::timestamptz, $4, '2026-09-01 00:00+00'::timestamptz, '2026-09-01 00:00+00'::timestamptz + $5::interval)`,
    [status, mode, until, paid, offset]);
  for (const s of ['reserved', 'paused', 'withdrawn', null]) assert.equal(await rule(s, 'on', null, true, '1 day'), 'closed', `${s}`);
  assert.equal(await rule('active', 'off', null, true, '1 day'), 'stopped_manual', 'a manual stop beats payment');
  assert.equal(await rule('active', 'on', null, false, '400 days'), 'started_manual', 'an open-ended manual start');
  assert.equal(await rule('active', 'on', '2026-12-01 00:00+00', false, '90 days 23:59:59.999999'), 'started_manual');
  assert.equal(await rule('active', 'on', '2026-12-01 00:00+00', false, '91 days'), 'stopped_unpaid', 'the manual start ends at its end date');
  assert.equal(await rule('active', 'on', '2026-12-01 00:00+00', true, '91 days'), 'paid');
  assert.equal(await rule('active', 'auto', null, true, '400 days'), 'paid');
  assert.equal(await rule('completed', 'auto', null, true, '400 days'), 'paid');
  assert.equal(await rule('active', 'auto', null, false, '29 days 23:59:59.999999'), 'grace');
  assert.equal(await rule('active', 'auto', null, false, '30 days'), 'stopped_unpaid', 'exactly 30 days: stopped');
});

test('a new enrollment is open for 30 days, unpaid, with the days left shown to the student', async () => {
  const s = await enroll(h, 'fresh@test.io');
  assert.equal(await sees(s), true);
  const a = await access(s);
  assert.deepEqual([a.state, a.open, a.paid, a.days_left, a.program, a.term], ['grace', true, false, 30, 'M.S. Data Science & Analytics', 1]);
  assert.ok(Math.abs(Date.parse(a.ends_at) - Date.now() - 30 * 86400000) < 60000);
  assert.deepEqual(Object.keys(a).sort(), ['batch_id', 'code', 'days_left', 'ends_at', 'enrollment_id', 'open', 'paid', 'program', 'program_id', 'state', 'term'],
                   'no admin reason or names');
});

test('at exactly 30 days unpaid access stops, by the database clock, at every gate', async () => {
  const s = await enroll(h, 'edge@test.io');
  const set = `update enrollments set enrolled_at = now() - interval '30 days' + $2::interval where id = $1`;
  const gates = `select can_see_batch($1) as batch, $1 in (select my_active_batches()) as active,
                        (select count(*)::int from sessions where batch_id = $1) as sessions,
                        (select count(*)::int from storage.objects where bucket_id = 'course-files') as files`;
  assert.deepEqual(await atOneInstant(s.id, set, [s.eid, '1 microsecond'], gates, [B]), { batch: true, active: true, sessions: 24, files: 1 },
                   'one microsecond before 30 days: open');
  assert.deepEqual(await atOneInstant(s.id, set, [s.eid, '0'], gates, [B]), { batch: false, active: false, sessions: 0, files: 0 },
                   'exactly 30 days: stopped');
  assert.equal(await sees(s), true, 'the transaction was rolled back');
});

test('late joiners get 30 days from when they enrolled; a future term counts from its start', async () => {
  const late = await enroll(h, 'late@test.io');
  await joined(late.eid, '10 days');
  assert.deepEqual([(await access(late)).state, (await access(late)).days_left], ['grace', 20]);
  await joined(late.eid, '29 days 23 hours');
  assert.deepEqual([(await access(late)).state, (await access(late)).days_left, await sees(late)], ['grace', 1, true]);
  await joined(late.eid, '30 days 1 minute');
  assert.deepEqual([(await access(late)).state, (await access(late)).open, (await access(late)).days_left, await sees(late)],
                   ['stopped_unpaid', false, null, false]);

  const next = await h.one(h.sql, `select first_monday((current_date + interval '1 month')::date)`);
  const early = await enroll(h, 'early@test.io', `'${next.toISOString().slice(0, 10)}'::date`, 'bs-aiml');
  await joined(early.eid, '60 days');
  const a = await access(early);
  assert.equal(a.state, 'grace', 'enrolling early does not use up the 30 days');
  const start = await h.one(h.sql, `select (starts_on::timestamp at time zone timezone) from batches where id = $1`, [a.batch_id]);
  assert.equal(Date.parse(a.ends_at), start.getTime() + 30 * 86400000, 'the 30 days start at 00:00 on the start date, in the batch time zone');
});

test('a stopped term closes every student page, action and file, exactly like a paused one', async () => {
  const s = await enroll(h, 'stopped@test.io');
  const open = await enroll(h, 'open@test.io');
  await h.as(open.id)(`select record_progress($1, 0, 10)`, [lesson]);
  await h.as(s.id)(`select record_progress($1, 0, 10)`, [lesson]);
  await joined(s.eid, '31 days');
  const me = h.as(s.id);

  const dash = await h.one(me, `select my_dashboard(p_now => now())`);
  assert.deepEqual(dash.batches, [], 'the batch is left out of the portal');
  assert.deepEqual(dash.continue_watching, []);
  assert.deepEqual(dash.access.map((a) => [a.state, a.open, a.paid]), [['stopped_unpaid', false, false]], 'but its pause is explained');
  for (const fn of ['my_course($1)', 'my_sessions($1)', 'my_assignments($1)', 'my_home($1)']) await rejects(me(`select ${fn}`, [B]), 'Batch not found');
  await rejects(me(`select my_lesson($1)`, [lesson]), 'Lesson not found');
  await rejects(me(`select record_progress($1, 10, 20)`, [lesson]), 'Not enrolled');
  await rejects(me(`select mark_reading_done($1)`, [lesson]), 'Not enrolled');
  await rejects(me(`select submit_assignment($1, 'https://github.com/x/y')`, [task]), 'Your portal access to this program is paused');
  for (const t of ['batches', 'sessions', 'batch_assignments', 'batch_staff']) {
    assert.equal(await h.one(me, `select count(*)::int from ${t}`), 0, `${t} rows`);
  }
  assert.equal(await h.one(me, `select count(*)::int from storage.objects where bucket_id = 'course-files'`), 0, 'no PDFs');
  assert.equal(await h.one(me, `select can_read_material('ms-ds/t1/notes.pdf')`), false);

  // The same calls work for the student whose term is still open.
  const ok = h.as(open.id);
  for (const fn of ['my_course($1)', 'my_sessions($1)', 'my_assignments($1)', 'my_home($1)']) await ok(`select ${fn}`, [B]);
  assert.equal((await h.one(ok, `select my_sessions($1)`, [B])).filter((x) => x.join_url).length, 1, 'the live class link');
  await ok(`select my_lesson($1)`, [lesson]);
  await ok(`select record_progress($1, 10, 20)`, [lesson]);
  assert.equal(await h.one(ok, `select count(*)::int from storage.objects where bucket_id = 'course-files'`), 1);

  // Reminders and "recording ready" go only to students whose access is open.
  const upcoming = await h.one(h.sql, `select id from sessions where batch_id = $1 and starts_at > now() order by starts_at limit 1`, [B]);
  await h.sql(`update sessions set starts_at = now() + interval '2 hours', ends_at = now() + interval '3 hours' where id = $1`, [upcoming]);
  await h.service(`select queue_session_reminders(24)`);
  const reminded = (await h.sql(`select user_id from notifications where kind = 'reminder_24h' and ref_id = $1`, [upcoming])).rows.map((r) => r.user_id);
  assert.ok(reminded.includes(open.id) && !reminded.includes(s.id));
  const past = await h.one(h.sql, `select id from sessions where batch_id = $1 and starts_at < now() - interval '1 day' order by starts_at limit 1`, [B]);
  await h.service(`select attach_recording($1, 'vid_stopped_test')`, [past]);
  const told = (await h.sql(`select user_id from notifications where kind = 'recording' and ref_id = $1`, [past])).rows.map((r) => r.user_id);
  assert.ok(told.includes(open.id), 'a student whose access is open hears that the recording is ready');
  assert.ok(!told.includes(s.id), 'a stopped student does not');
});

test('a completed term stays open for review only while the program\'s current term is open', async () => {
  const s = await h.user('review@test.io');
  const t1 = await h.one(h.service, `select create_batch('bs-aiml', ${PAST_MONDAY} - 84, 1)`);
  const t2 = await h.one(h.service, `select create_batch('bs-aiml', ${PAST_MONDAY}, 2)`);
  const e1 = await h.one(h.sql, `insert into enrollments (student_id, batch_id, program_id, status) values ($1, $2, 'bs-aiml', 'completed') returning id`, [s, t1]);
  const e2 = await h.one(h.sql, `insert into enrollments (student_id, batch_id, program_id, status) values ($1, $2, 'bs-aiml', 'active') returning id`, [s, t2]);
  await h.as(admin)(`select admin_record_payment($1, 1950, 'cash')`, [e1]);
  const t1Lesson = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' and m.term_no = 1 limit 1`);
  const review = () => h.one(h.sql, `select term_open($1, 'bs-aiml', 1)`, [s]);
  assert.equal(await review(), true, 'term 2 is in its 30 days');
  await h.as(s)(`select my_lesson($1)`, [t1Lesson]);
  await h.sql(`update enrollments set enrolled_at = now() - interval '45 days' where id = $1`, [e2]);
  assert.equal(await review(), false, 'term 2 unpaid past 30 days: term 1 pauses too');
  await rejects(h.as(s)(`select my_lesson($1)`, [t1Lesson]), 'Lesson not found');
  await h.as(admin)(`select admin_record_payment($1, 1950, 'cash')`, [e2]);
  assert.equal(await review(), true);
  await h.as(admin)(`select admin_set_access($1, 'off', 'Paused at the student''s request')`, [e1]);
  assert.equal(await review(), false, 'and a completed term can be stopped on its own');
});

test('recording a payment opens access at once; voiding it closes it again', async () => {
  const s = await enroll(h, 'payer@test.io');
  await joined(s.eid, '40 days');
  assert.equal(await sees(s), false);
  const r = await pay(s, 2450, 'bank_transfer', 'HDFC-0001');
  assert.deepEqual([r.access.state, r.access.open, r.access.paid, r.access.paid_usd, r.access.tuition_usd, r.access.ends_at],
                   ['paid', true, true, 2450, 2450, null]);
  assert.equal(await sees(s), true, 'immediately');
  assert.equal((await access(s)).state, 'paid');
  const partial = await pay(s, 100, 'cash');
  assert.equal(partial.access.paid_usd, 2550);
  await h.as(admin)(`select admin_void_payment($1, 'Entered twice')`, [partial.payment.id]);
  assert.equal(await sees(s), true, 'one payment left: still paid');
  const v = await h.one(h.as(admin), `select admin_void_payment($1, 'Bank reversed the transfer')`, [r.payment.id]);
  assert.deepEqual([v.payment.voided, v.payment.void_reason, v.access.state, v.access.paid_usd], [true, 'Bank reversed the transfer', 'stopped_unpaid', 0]);
  assert.equal(await sees(s), false, 'the last payment voided: the 30 days are over, so access stops');
  // The void itself records and announces the stop, without waiting for the hourly job.
  const stops = (await h.sql(`select state, actor from access_events where enrollment_id = $1 and kind = 'stopped'`, [s.eid])).rows;
  assert.deepEqual(stops, [{ state: 'stopped_unpaid', actor: admin }], 'in the access history, by this admin');
  assert.deepEqual((await notes(s.id)).map((x) => x.kind), ['access_stopped'], 'the student is told at once');
  for (const a of [admin, admin2]) {
    assert.equal((await notes(a, 'access_stopped')).filter((x) => x.body.includes('payer@test.io')).length, 1, 'and so is every admin');
  }
  assert.equal(await h.one(h.sql, `select count(*)::int from payments where enrollment_id = $1`, [s.eid]), 2, 'voided payments stay in the ledger');
  await pay(s, 0, 'waiver');
  assert.equal(await sees(s), true, 'a waiver counts as payment');
});

test('a manual stop beats payment; returning to automatic applies the rule again', async () => {
  const s = await enroll(h, 'manual@test.io');
  await pay(s);
  await rejects(setAccess(s, 'off'), 'Give a reason');
  await rejects(setAccess(s, 'off', '   '), 'Give a reason');
  const off = await setAccess(s, 'off', 'Code of conduct review');
  assert.deepEqual([off.state, off.open, off.mode, off.reason, off.set_by, off.paid], ['stopped_manual', false, 'off', 'Code of conduct review', 'Ada Admin', true]);
  assert.equal(await sees(s), false, 'immediately');
  await pay(s, 50, 'cash');
  assert.equal(await sees(s), false, 'paying does not undo a manual stop');
  assert.equal((await access(s)).state, 'stopped_manual');
  const auto = await setAccess(s, 'auto');
  assert.deepEqual([auto.state, auto.mode, auto.reason], ['paid', 'auto', null]);
  assert.equal(await sees(s), true);
  const n = await notes(s.id);
  assert.deepEqual(n.map((x) => x.kind), ['access_stopped', 'access_restored'], 'the student is told once each way');
  assert.match(n[0].body, /Nuvora has paused your access to M\.S\. Data Science & Analytics/);
  assert.doesNotMatch(n[0].body, /conduct/, 'the internal reason is not sent to the student');
  assert.equal((await notes(admin, 'access_stopped')).filter((x) => x.body.includes('manual@test.io')).length, 0, 'admins are not paged for their own stop');
});

test('a manual start overrides the payment rule until its end date, then the rule applies again', async () => {
  const s = await enroll(h, 'extended@test.io');
  await joined(s.eid, '45 days');
  assert.equal(await sees(s), false);
  await rejects(setAccess(s, 'on', null, new Date(Date.now() - 60000).toISOString()), 'in the future');
  await rejects(setAccess(s, 'on', null, new Date(Date.now() + 400 * 86400000).toISOString()), 'at most a year');
  await rejects(setAccess(s, 'off', 'x', new Date(Date.now() + 86400000).toISOString()), 'only be set when starting');
  await rejects(setAccess(s, 'sometimes'), 'Choose auto, on or off');
  const until = new Date(Date.now() + 3 * 86400000 - 3600000).toISOString();
  const on = await setAccess(s, 'on', 'Paying on Friday', until);
  assert.deepEqual([on.state, on.open, on.mode, Date.parse(on.until), Date.parse(on.ends_at), on.days_left],
                   ['started_manual', true, 'on', Date.parse(until), Date.parse(until), 3]);
  assert.equal(await sees(s), true);
  // The end date passes: access stops by the database clock straight away, before any job runs.
  await h.sql(`update enrollment_access set until = now() - interval '1 second' where enrollment_id = $1`, [s.eid]);
  assert.equal(await sees(s), false);
  assert.equal((await access(s)).state, 'stopped_unpaid');

  const open = await setAccess(s, 'on', 'Until further notice');
  assert.deepEqual([open.state, open.until, open.ends_at, open.days_left], ['started_manual', null, null, null], 'an open-ended start');
  const paid = await pay(s);
  assert.equal(paid.access.state, 'started_manual', 'the manual setting is kept until changed');
  assert.equal((await setAccess(s, 'auto')).state, 'paid');
});

test('a time sent by the client never changes access', async () => {
  const stopped = await enroll(h, 'clock1@test.io');
  await joined(stopped.eid, '35 days');
  const fresh = await enroll(h, 'clock2@test.io');
  for (const at of [new Date(Date.now() - 60 * 86400000), new Date(Date.now() - 30 * 86400000)]) {
    const d = await h.one(h.as(stopped.id), `select my_dashboard($1::timestamptz)`, [at.toISOString()]);
    assert.deepEqual([d.batches.length, d.access[0].state], [0, 'stopped_unpaid'], `p_now ${at.toISOString()}`);
    await rejects(h.as(stopped.id)(`select my_home($1, $2::timestamptz)`, [B, at.toISOString()]), 'Batch not found');
    await rejects(h.as(stopped.id)(`select my_assignments($1, $2::timestamptz)`, [B, at.toISOString()]), 'Batch not found');
  }
  const future = new Date(Date.now() + 90 * 86400000).toISOString();
  const d = await h.one(h.as(fresh.id), `select my_dashboard($1::timestamptz)`, [future]);
  assert.deepEqual([d.batches.length, d.access.find((a) => a.enrollment_id === fresh.eid).state], [1, 'grace']);
  await h.as(fresh.id)(`select my_home($1, $2::timestamptz)`, [B, future]);
  // The rule's own functions take a time, so they are closed to the API.
  for (const sql of [`select access_rule('active', 'auto', null, false, now(), now())`, `select access_of($1, now() - interval '60 days')`,
                     `select apply_access_rules()`, `select sync_access($1)`, `select access_open(e) from enrollments e where id = $1`]) {
    await rejects(h.as(stopped.id)(sql, sql.includes('$1') ? [stopped.eid] : []), '42501');
  }
});

test('paused, withdrawn and reserved enrollments open nothing, paid or not, whatever the manual setting', async () => {
  const s = await enroll(h, 'status@test.io');
  await pay(s);
  await setAccess(s, 'on', 'Testing');
  for (const st of ['paused', 'withdrawn', 'reserved']) {
    await h.as(admin)(`select admin_set_enrollment_status($1, $2)`, [s.eid, st]);
    assert.equal(await sees(s), false, st);
    assert.equal((await h.one(h.as(admin), `select admin_student($1)`, [s.id])).enrollments[0].access.state, 'closed');
  }
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [s.eid]);
  assert.equal(await sees(s), true);
});

test('students cannot read payments, access settings, the access history or the audit log', async () => {
  const s = await enroll(h, 'nosy@test.io');
  await pay(other);
  for (const t of ['payments', 'enrollment_access', 'access_events', 'admin_audit']) {
    for (const who of [h.as(s.id), h.as(other.id), h.as(inst), h.anon]) await rejects(who(`select * from ${t}`), '42501');
    await rejects(h.as(s.id)(`delete from ${t}`), '42501');
  }
  await rejects(h.as(s.id)(`insert into payments (enrollment_id, amount_usd, method, paid_on) values ($1, 1, 'cash', current_date)`, [s.eid]), '42501');
  await rejects(h.as(admin)(`select * from payments`), '42501', 'admins too go through their functions');
});

test('the hourly job: records each stop once, reminds 7 days and 1 day before, ends manual starts, and repeats nothing', async () => {
  const j = await freshDb();
  const jb = await j.one(j.service, `select create_batch('ms-ds', ${PAST_MONDAY}, 1)`);
  const a1 = await j.user('a1@test.io', 'admin', 'Ada Admin');
  const a2 = await j.user('a2@test.io', 'admin', 'Bo Admin');
  const mk = async (email, ago, name = email.split('@')[0]) => {
    const id = await j.user(email, 'student', name);
    const eid = await j.one(j.service, `select enroll_student($1, 'ms-ds', ${PAST_MONDAY})`, [id]);
    await j.sql(`update enrollments set enrolled_at = now() - $2::interval where id = $1`, [eid, ago]);
    return { id, eid };
  };
  const tenDays = await mk('ten@test.io', '20 days');
  const week = await mk('week@test.io', '23 days 12 hours');
  const day = await mk('day@test.io', '29 days 12 hours');
  const lapsed = await mk('lapsed@test.io', '40 days', 'Kenji Lapsed');
  const paidUp = await mk('paid@test.io', '40 days');
  await j.as(a1)(`select admin_record_payment($1, 2450, 'cash')`, [paidUp.eid]);
  const ending = await mk('ending@test.io', '50 days');
  await j.as(a1)(`select admin_set_access($1, 'on', 'Grace extended', now() + interval '1 day')`, [ending.eid]);
  await j.sql(`update enrollment_access set until = now() - interval '1 minute' where enrollment_id = $1`, [ending.eid]);
  const longer = await mk('longer@test.io', '50 days');
  await j.as(a1)(`select admin_set_access($1, 'on', 'Paying next week', now() + interval '5 days')`, [longer.eid]);
  const kinds = async (u) => (await j.sql(`select kind from notifications where user_id = $1 and kind like 'access%' order by kind`, [u])).rows.map((r) => r.kind);

  assert.deepEqual(await j.one(j.service, `select apply_access_rules()`),
                   { starts_ended: 1, stopped: 2, restored: 0, reminders_7d: 2, reminders_1d: 1 });
  assert.deepEqual(await kinds(tenDays.id), [], '10 days left: nothing yet');
  assert.deepEqual(await kinds(week.id), ['access_reminder_7d']);
  assert.deepEqual(await kinds(day.id), ['access_reminder_1d'], 'less than a day left: only the 1-day reminder');
  assert.deepEqual(await kinds(lapsed.id), ['access_stopped']);
  assert.deepEqual(await kinds(ending.id), ['access_stopped'], 'the manual start ended and the term is unpaid');
  assert.deepEqual(await kinds(longer.id), ['access_reminder_7d'], 'a manual start gets reminders for its own end date');
  assert.deepEqual(await kinds(paidUp.id), []);
  const r7 = (await j.sql(`select title, body from notifications where user_id = $1 and kind = 'access_reminder_7d'`, [week.id])).rows[0];
  assert.match(r7.title, /^Tuition reminder: your access pauses on [A-Z][a-z]{2} \d{1,2}$/);
  assert.match(r7.body, /Term 1 of M\.S\. Data Science & Analytics has not been paid yet\. .* \(America\/New_York\) and then pauses until your payment is recorded\./);
  for (const admin of [a1, a2]) {
    const n = (await j.sql(`select title, body from notifications where user_id = $1 and kind = 'access_stopped' order by title`, [admin])).rows;
    assert.deepEqual(n.map((x) => x.title).sort(), ['Access stopped: Kenji Lapsed', 'Access stopped: ending'], 'every admin, once per stop');
    assert.match(n.find((x) => x.title.includes('Kenji')).body, /^Kenji Lapsed \(lapsed@test\.io\), MSDS-T1-\d{4}-\d{2}: term 1 is unpaid 30 days after its access period began\./);
  }
  const ended = (await j.sql(`select mode, until, reason from enrollment_access where enrollment_id = $1`, [ending.eid])).rows[0];
  assert.deepEqual(ended, { mode: 'auto', until: null, reason: null }, 'back to automatic');
  const history = (await j.sql(`select kind, state, reason, actor from access_events where enrollment_id = $1 order by created_at, id`, [ending.eid])).rows;
  assert.deepEqual(history.map((x) => [x.kind, x.state, x.reason, x.actor === null]),
                   [['mode_on', null, 'Grace extended', false], ['mode_auto', null, 'Manual start ended', true], ['stopped', 'stopped_unpaid', null, true]]);

  const total = await j.one(j.sql, `select count(*)::int from notifications`);
  const events = await j.one(j.sql, `select count(*)::int from access_events`);
  assert.deepEqual(await j.one(j.service, `select apply_access_rules()`), { starts_ended: 0, stopped: 0, restored: 0, reminders_7d: 0, reminders_1d: 0 });
  assert.deepEqual(await j.one(j.service, `select apply_access_rules()`), { starts_ended: 0, stopped: 0, restored: 0, reminders_7d: 0, reminders_1d: 0 });
  assert.equal(await j.one(j.sql, `select count(*)::int from notifications`), total, 'a second run sends nothing');
  assert.equal(await j.one(j.sql, `select count(*)::int from access_events`), events, 'and records nothing');

  // A day later, the 7-day student is now within a day: the 1-day reminder comes once.
  await j.sql(`update enrollments set enrolled_at = enrolled_at - interval '6 days' where id = $1`, [week.eid]);
  assert.equal((await j.one(j.service, `select apply_access_rules()`)).reminders_1d, 1);
  assert.equal((await j.one(j.service, `select apply_access_rules()`)).reminders_1d, 0);
  assert.deepEqual(await kinds(week.id), ['access_reminder_1d', 'access_reminder_7d']);

  // Payment restores access at once; the admin's action announces it, so the job has nothing to add.
  await j.as(a1)(`select admin_record_payment($1, 2450, 'bank_transfer', 'NEFT-77')`, [lapsed.eid]);
  assert.deepEqual(await kinds(lapsed.id), ['access_restored', 'access_stopped']);
  assert.equal((await j.one(j.service, `select apply_access_rules()`)).restored, 0);
  assert.deepEqual(await kinds(lapsed.id), ['access_restored', 'access_stopped']);
  // A change the job finds by itself (here, an end date moved by hand) is restored once.
  await j.sql(`update enrollments set enrolled_at = now() where id = $1`, [ending.eid]);
  assert.equal((await j.one(j.service, `select apply_access_rules()`)).restored, 1);
  assert.equal((await j.one(j.service, `select apply_access_rules()`)).restored, 0);
  assert.deepEqual(await kinds(ending.id), ['access_restored', 'access_stopped']);
  await rejects(j.as(a1)(`select apply_access_rules()`), '42501');
  await rejects(j.anon(`select apply_access_rules()`), '42501');
  void jb;
});

