// Portal pages: every read is limited to the caller's own batch, Jitsi links unlock only near class time,
// and staff pages show only the batches a person teaches.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, oct, nov, a, a2, b, d, iOct, iNov, iNone, admin, lessons, octSessions;

before(async () => {
  h = await freshDb();
  oct = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  nov = await h.one(h.service, `select create_batch('bs-aiml', '2026-11-02')`);
  await h.service(`select create_batch('ms-ds', '2026-10-05')`);
  a = await h.user('asha@test.io', 'student', 'Asha Rao');
  a2 = await h.user('arjun@test.io', 'student', 'Arjun Mehta');
  b = await h.user('ben@test.io', 'student', 'Ben Ode');
  d = await h.user('dev@test.io', 'student', 'Dev Shah');
  iOct = await h.user('oct.instructor@test.io', 'instructor');
  iNov = await h.user('nov.instructor@test.io', 'instructor');
  iNone = await h.user('new.instructor@test.io', 'instructor');
  admin = await h.user('admin@test.io', 'admin');
  for (const s of [a, a2]) await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [s]);
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-11-02')`, [b]);
  await h.service(`select enroll_student($1, 'ms-ds', '2026-10-05')`, [d]);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [oct, iOct]);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [nov, iNov]);
  await h.sql(`update sessions set join_url = 'https://Jitsi.us/j/' || substr(md5(id::text), 1, 10)`);
  lessons = (await h.sql(`select l.id from lessons l join modules m on m.id = l.module_id
                          where m.program_id = 'bs-aiml' and m.term_no = 1 order by l.position`)).rows.map((r) => r.id);
  octSessions = (await h.sql(`select id from sessions where batch_id = $1 order by starts_at`, [oct])).rows.map((r) => r.id);
});

// Move a session so it starts `mins` minutes from now (negative = already started), lasting an hour.
const startIn = (id, mins) => h.sql(`update sessions set starts_at = now() + make_interval(mins => $2),
                                      ends_at = now() + make_interval(mins => $2 + 60), status = 'scheduled' where id = $1`, [id, mins]);

test('course page lists every module and lesson with the student\'s own progress', async () => {
  await h.as(a)(`select record_progress($1, 0, 30)`, [lessons[0]]);
  const c = await h.one(h.as(a), `select my_course($1)`, [oct]);
  assert.equal(c.batch.code, 'BSAIML-T1-2026-10');
  assert.equal(c.batch.weeks, 12);
  assert.equal(c.modules.flatMap((m) => m.lessons).length, 4, 'only the lessons of the batch\'s term');
  assert.deepEqual(c.modules.map((m) => m.position), [...c.modules.keys()].map((i) => i + 1), 'modules in order');
  const first = c.modules[0].lessons[0];
  assert.equal(first.id, lessons[0]);
  assert.ok(first.percent > 0 && first.completed === false);
  const classmate = await h.one(h.as(a2), `select my_course($1)`, [oct]);
  assert.equal(classmate.modules[0].lessons[0].percent, 0, 'progress is per student');
});

test('a batch you are not in is "not found", whoever asks', async () => {
  await rejects(h.as(b)(`select my_course($1)`, [oct]), 'Batch not found');
  await rejects(h.as(d)(`select my_sessions($1)`, [oct]), 'Batch not found');
  await rejects(h.as(a)(`select my_assignments($1)`, [nov]), 'Batch not found');
  await rejects(h.as(a)(`select my_course(gen_random_uuid())`), 'Batch not found');
  await rejects(h.as(iNov)(`select my_course($1)`, [oct]), 'Batch not found');
  assert.ok(await h.one(h.as(iOct), `select my_course($1)`, [oct]), 'its instructor may open it');
  assert.ok(await h.one(h.as(admin), `select my_course($1)`, [nov]), 'admins may open any');
});

test('a paused student loses access to the batch pages immediately', async () => {
  const e = await h.one(h.sql, `select id from enrollments where student_id = $1`, [a2]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'paused')`, [e]);
  await rejects(h.as(a2)(`select my_course($1)`, [oct]), 'Batch not found');
  await rejects(h.as(a2)(`select my_lesson($1)`, [lessons[0]]), 'Lesson not found');
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [e]);
  assert.ok(await h.one(h.as(a2), `select my_course($1)`, [oct]));
});

test('lesson page knows its neighbours and whether progress is tracked', async () => {
  const first = await h.one(h.as(a), `select my_lesson($1)`, [lessons[0]]);
  assert.equal(first.prev, null);
  assert.equal(first.next.id, lessons[1]);
  assert.equal(first.index, 1);
  assert.equal(first.total, 4);
  assert.equal(first.can_track, true);
  assert.equal(first.batch_id, oct);
  const last = await h.one(h.as(a), `select my_lesson($1)`, [lessons[3]]);
  assert.equal(last.next, null);
  assert.equal(last.prev.id, lessons[2]);
  const preview = await h.one(h.as(iOct), `select my_lesson($1)`, [lessons[0]]);
  assert.equal(preview.can_track, false, 'staff preview is not counted');
  await rejects(h.as(d)(`select my_lesson($1)`, [lessons[0]]), 'Lesson not found');
  await rejects(h.as(iNone)(`select my_lesson($1)`, [lessons[0]]), 'Lesson not found');
});

test('Jitsi links appear only from 15 minutes before a class until it ends', async () => {
  const [s1, s2, s3, s4] = octSessions;
  await startIn(s1, 10);    // opens in -5 min: joinable
  await startIn(s2, 20);    // too early
  await startIn(s3, -30);   // live now
  await h.sql(`update sessions set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours' where id = $1`, [s4]);
  const list = await h.one(h.as(a), `select my_sessions($1)`, [oct]);
  const by = Object.fromEntries(list.map((s) => [s.id, s]));
  assert.match(by[s1].join_url, /^https:\/\/Jitsi\.us\/j\//);
  assert.equal(by[s1].phase, 'upcoming');
  assert.equal(by[s2].join_url, null);
  assert.equal(by[s3].phase, 'live');
  assert.ok(by[s3].join_url);
  assert.equal(by[s4].phase, 'ended');
  assert.equal(by[s4].join_url, null);
  assert.equal(list.filter((s) => s.join_url).length, 2, 'no other links handed out');
});

test('links cannot be read straight from the table, nor video ids from lessons', async () => {
  await rejects(h.as(a)(`select join_url from sessions`), '42501');
  await rejects(h.as(a)(`select recording_asset_id from sessions`), '42501');
  await rejects(h.as(a)(`select * from sessions`), '42501');
  assert.equal(await h.one(h.as(a), `select count(*)::int from (select id, title, starts_at from sessions) s`), 24);
  await rejects(h.as(a)(`select video_asset_id from lessons`), '42501');
});

test('the dashboard never unlocks a link early, even if the caller fakes the time', async () => {
  const far = octSessions[5];
  const startsAt = await h.one(h.sql, `select starts_at from sessions where id = $1`, [far]);
  const dash = await h.one(h.as(a), `select my_dashboard($1::timestamptz)`, [startsAt]);
  for (const s of dash.batches[0].next_sessions) {
    const real = await h.one(h.sql, `select now() between starts_at - interval '15 minutes' and ends_at from sessions where id = $1`, [s.id]);
    if (!real) assert.equal(s.join_url, null, s.title);
  }
});

test('recordings and attendance show on the live classes page', async () => {
  const s4 = octSessions[3];
  await h.service(`select attach_recording($1, 'vid_demo')`, [s4]);
  await h.service(`select record_attendance($1, 'asha@test.io', now() - interval '3 hours', now() - interval '2 hours 10 minutes')`, [s4]);
  const list = await h.one(h.as(a), `select my_sessions($1)`, [oct]);
  const row = list.find((s) => s.id === s4);
  assert.equal(row.has_recording, true);
  assert.equal(row.attended_minutes, 50);
  const other = (await h.one(h.as(a2), `select my_sessions($1)`, [oct])).find((s) => s.id === s4);
  assert.equal(other.attended_minutes, null, 'classmate did not attend');
  assert.equal(JSON.stringify(list).includes('vid_demo'), false, 'recording id is never sent');
});

test('assignments page shows the student\'s own submission, grade and feedback', async () => {
  const [t1] = (await h.one(h.as(a), `select my_assignments($1)`, [oct])).map((x) => x.id);
  await h.as(a)(`select submit_assignment($1, 'https://github.com/asha/p1', null, 'First try')`, [t1]);
  const sub = await h.one(h.sql, `select id from submissions where assignment_id = $1 and student_id = $2`, [t1, a]);
  await h.as(iOct)(`select grade_submission($1, 'basic', 'Add a baseline model')`, [sub]);
  const mine = (await h.one(h.as(a), `select my_assignments($1)`, [oct]))[0];
  assert.equal(mine.status, 'needs_resubmission');
  assert.equal(mine.submission.grade, 'basic');
  assert.equal(mine.submission.feedback, 'Add a baseline model');
  assert.equal(mine.submission.note, 'First try');
  const theirs = (await h.one(h.as(a2), `select my_assignments($1)`, [oct]))[0];
  assert.equal(theirs.submission, null, 'classmates never see it');
  const later = await h.one(h.as(a2), `select my_assignments($1, '2027-06-01')`, [oct]);
  assert.ok(later.every((x) => x.status === 'overdue'));
});

test('notifications are private and only the owner can mark them read', async () => {
  const mine = await h.one(h.as(a), `select my_notifications()`);
  assert.ok(mine.unread >= 2, 'welcome + graded');
  const welcome = mine.items.find((n) => n.kind === 'welcome');
  assert.equal(await h.one(h.as(a2), `select mark_notifications_read($1)`, [welcome.id]), 0, 'not theirs');
  assert.equal(await h.one(h.as(a), `select mark_notifications_read($1)`, [welcome.id]), 1);
  assert.equal(await h.one(h.as(a), `select mark_notifications_read($1)`, [welcome.id]), 0, 'already read');
  await h.as(a)(`select mark_notifications_read()`);
  assert.equal((await h.one(h.as(a), `select my_notifications()`)).unread, 0);
  assert.ok((await h.one(h.as(a2), `select my_notifications()`)).unread >= 1, 'classmate unaffected');
  assert.equal((await h.one(h.as(a), `select my_notifications(1)`)).items.length, 1, 'limit respected');
});

test('students can rename themselves within limits, and nothing else', async () => {
  assert.deepEqual(await h.one(h.as(a), `select update_my_profile('  Asha   R.  ')`), { name: 'Asha R.' });
  await rejects(h.as(a)(`select update_my_profile('A')`), '2 to 80');
  await rejects(h.as(a)(`select update_my_profile($1)`, ['x'.repeat(81)]), '2 to 80');
  await rejects(h.as(a)(`select update_my_profile($1)`, ['Asha\u0007Rao']), '2 to 80');
  assert.equal(await h.one(h.sql, `select role from profiles where id = $1`, [a]), 'student');
});

test('staff overview shows only the batches a person teaches', async () => {
  const mine = await h.one(h.as(iOct), `select staff_overview()`);
  assert.deepEqual(mine.map((x) => x.code), ['BSAIML-T1-2026-10']);
  assert.equal(mine[0].students, 2);
  assert.ok('next_session' in mine[0]);
  const all = await h.one(h.as(admin), `select staff_overview()`);
  assert.equal(all.length, 3);
  assert.deepEqual(await h.one(h.as(iNone), `select staff_overview()`), [], 'new instructor: nothing yet');
  await rejects(h.as(a)(`select staff_overview()`), 'Staff only');
  await rejects(h.as(a)(`select staff_grading_queue()`), 'Staff only');
  await rejects(h.as(a)(`select staff_roster($1)`, [oct]), 'Staff only');
});

test('grading queue holds only submissions from batches the grader teaches', async () => {
  const [t1, t2] = (await h.one(h.as(a2), `select my_assignments($1)`, [oct])).map((x) => x.id);
  await h.as(a2)(`select submit_assignment($1, 'https://github.com/arjun/p2')`, [t2]);
  await h.as(a)(`select submit_assignment($1, 'https://github.com/asha/p1-v2')`, [t1]);
  const q = await h.one(h.as(iOct), `select staff_grading_queue()`);
  assert.equal(q.length, 2);
  const resub = q.find((x) => x.student.email === 'asha@test.io');
  assert.equal(resub.attempt, 2);
  assert.equal(resub.previous_feedback, 'Add a baseline model');
  assert.deepEqual(await h.one(h.as(iNov), `select staff_grading_queue()`), []);
  assert.deepEqual(await h.one(h.as(iOct), `select staff_grading_queue($1)`, [nov]), [], 'filter cannot widen access');
  assert.equal((await h.one(h.as(admin), `select staff_grading_queue()`)).length, 2);
  await h.as(iOct)(`select grade_submission($1, 'proficient', 'Good')`, [resub.id]);
  assert.equal((await h.one(h.as(iOct), `select staff_grading_queue()`)).length, 1, 'graded work leaves the queue');
});

test('roster shows each student\'s progress to that batch\'s staff only', async () => {
  const r = await h.one(h.as(iOct), `select staff_roster($1)`, [oct]);
  assert.deepEqual(r.students.map((s) => s.email), ['arjun@test.io', 'asha@test.io']);
  const asha = r.students.find((s) => s.email === 'asha@test.io');
  assert.equal(asha.attended, 1);
  assert.equal(asha.passed, 1);
  assert.equal(r.lessons_total, 4);
  await rejects(h.as(iNov)(`select staff_roster($1)`, [oct]), 'Batch not found');
  await rejects(h.as(iOct)(`select staff_roster(gen_random_uuid())`), 'Batch not found');
});

test('signed-out visitors cannot call any portal function', async () => {
  for (const call of [`my_course($1)`, `my_sessions($1)`, `my_assignments($1)`, `staff_roster($1)`]) {
    await rejects(h.anon(`select ${call}`, [oct]), '42501');
  }
  for (const call of [`my_notifications()`, `mark_notifications_read()`, `staff_overview()`, `staff_grading_queue()`,
                      `update_my_profile('x y')`, `my_lesson(gen_random_uuid())`]) {
    await rejects(h.anon(`select ${call}`), '42501');
  }
});

