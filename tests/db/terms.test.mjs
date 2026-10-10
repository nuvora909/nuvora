// Programs as sequences of 12-week terms: one batch per term, content limited to the terms a student has
// reached (active or completed enrollment), and the daily job that completes a term, reserves the student's
// seat in the next one as soon as the term is finished, and opens that seat on its start date. Fixed dates
// throughout.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, t1, admin, inst, asha, ben, cara, l1, l2;

const termLessons = async (program, term) => (await h.sql(
  `select l.id, l.code, l.duration_seconds d from lessons l join modules m on m.id = l.module_id
   where m.program_id = $1 and m.term_no = $2 order by l.position`, [program, term])).rows;
const finishLessons = async (student, program, term) => {
  for (const l of await termLessons(program, term)) {
    await h.sql(`insert into lesson_progress (student_id, lesson_id, watched_seconds, completed_at) values ($1, $2, $3, now())
                 on conflict (student_id, lesson_id) do update set completed_at = now()`, [student, l.id, l.d]);
  }
};
// Submit every project of the batch and grade it (a missing grade leaves that project unsubmitted).
const gradeAll = async (student, batch, grades) => {
  const tasks = (await h.sql(`select id from batch_assignments where batch_id = $1 order by due_at`, [batch])).rows;
  for (const [i, t] of tasks.entries()) {
    if (!grades[i]) continue;
    await h.as(student)(`select submit_assignment($1, 'https://github.com/student/project')`, [t.id]);
    const sub = await h.one(h.sql, `select id from submissions where assignment_id = $1 and student_id = $2`, [t.id, student]);
    await h.as(inst)(`select grade_submission($1, $2, 'Feedback for this attempt')`, [sub, grades[i]]);
  }
};
const enrollmentsOf = async (student) => (await h.sql(
  `select b.code, e.status from enrollments e join batches b on b.id = e.batch_id where e.student_id = $1 order by b.term_no, b.starts_on`, [student])).rows;
const batchId = (code) => h.one(h.sql, `select id from batches where code = $1`, [code]);
const enrollmentId = (student, code) => h.one(h.sql, `select e.id from enrollments e join batches b on b.id = e.batch_id
                                                      where e.student_id = $1 and b.code = $2`, [student, code]);
const files = async (user) => (await h.as(user)(`select name from storage.objects where bucket_id = 'course-files' order by name`)).rows.map((r) => r.name);

before(async () => {
  h = await freshDb();
  t1 = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  admin = await h.user('admin@test.io', 'admin');
  inst = await h.user('instructor@test.io', 'instructor');
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [t1, inst]);
  asha = await h.user('asha@test.io');
  ben = await h.user('ben@test.io');
  cara = await h.user('cara@test.io');
  for (const s of [asha, ben, cara]) await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [s]);
  l1 = await termLessons('bs-aiml', 1);
  l2 = await termLessons('bs-aiml', 2);

  await h.service(`insert into materials (program_id, lesson_id, title, file_path) values
                   ('bs-aiml', $1, 'Term 1 notes', 'bs-aiml/t1/notes.pdf'), ('bs-aiml', $2, 'Term 2 notes', 'bs-aiml/t2/notes.pdf')`, [l1[0].id, l2[0].id]);
  await h.service(`insert into materials (program_id, assignment_template_id, title, file_path)
                   select 'bs-aiml', id, 'Term 2 brief', 'bs-aiml/t2/brief.pdf' from assignment_templates
                   where program_id = 'bs-aiml' and term_no = 2 order by due_offset_days limit 1`);
  await h.service(`insert into materials (program_id, title, file_path) values ('bs-aiml', 'Program handbook', 'bs-aiml/handbook.pdf')`);
  await h.service(`insert into storage.objects (bucket_id, name) select 'course-files', file_path from materials`);
});

test('the catalog: 12 terms for bachelor\'s, 4 for master\'s, 1 for certificates; 4 lessons and 3 projects a term', async () => {
  const rows = (await h.sql(`
    select p.id, p.level, count(*)::int as terms, count(distinct t.badge)::int as badges,
           (select count(*)::int from lessons l join modules m on m.id = l.module_id where m.program_id = p.id) as lessons,
           (select count(distinct term_no)::int from modules m where m.program_id = p.id) as module_terms,
           (select count(*)::int from assignment_templates a where a.program_id = p.id) as projects,
           (select count(*)::int from session_templates s where s.program_id = p.id) as sessions
    from programs p join program_terms t on t.program_id = p.id group by p.id, p.level order by p.id`)).rows;
  assert.equal(rows.length, 7);
  for (const r of rows) {
    const n = { Bachelor: 12, Master: 4, Certificate: 1 }[r.level];
    assert.deepEqual([r.terms, r.badges, r.module_terms, r.lessons, r.projects, r.sessions], [n, n, n, 4 * n, 3 * n, 24 * n], r.id);
  }
  assert.equal(await h.one(h.sql, `select badge from program_terms where program_id = 'bs-aiml' and term_no = 1`), 'Python Proficiency');
});

test('a batch runs one term: the code names the term, and only that term\'s classes and projects are created', async () => {
  const t2 = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05', 2)`);
  assert.notEqual(t2, t1, 'two terms of a program may start on the same Monday');
  assert.deepEqual((await h.sql(`select code, term_no from batches where id = $1`, [t2])).rows[0], { code: 'BSAIML-T2-2026-10', term_no: 2 });
  assert.equal(await h.one(h.sql, `select code from batches where id = $1`, [t1]), 'BSAIML-T1-2026-10');
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions where batch_id = $1`, [t2]), 24);
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions s join session_templates t on t.id = s.template_id
                                   where s.batch_id = $1 and t.term_no <> 2`, [t2]), 0);
  const titles = async (sql, id) => (await h.sql(sql, id ? [id] : [])).rows.map((r) => r.title);
  assert.deepEqual(await titles(`select title from batch_assignments where batch_id = $1 order by due_at`, t2),
                   await titles(`select title from assignment_templates where program_id = 'bs-aiml' and term_no = 2 order by due_offset_days`));
  assert.deepEqual(await titles(`select title from batch_assignments where batch_id = $1 order by due_at`, t1),
                   await titles(`select title from assignment_templates where program_id = 'bs-aiml' and term_no = 1 order by due_offset_days`));
  assert.equal(await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05', 2)`), t2, 'same batch returned');
  await rejects(h.service(`select create_batch('bs-aiml', '2026-10-05', 13)`), 'has no term 13');
  await rejects(h.service(`select create_batch('c-py', '2026-10-05', 2)`), 'has no term 2');
  const t3 = await h.one(h.as(admin), `select admin_create_batch('bs-aiml', '2026-11-02', 3)`);
  assert.equal(await h.one(h.sql, `select code from batches where id = $1`, [t3]), 'BSAIML-T3-2026-11');
  await rejects(h.as(asha)(`select admin_create_batch('bs-aiml', '2026-11-02', 3)`), 'Admins only');
});

test('next term start: the first first-Monday after the batch ends, never in the past', async () => {
  const at = (after, today) => h.one(h.sql, `select next_term_start($1::date, $2::date)::text`, [after, today]);
  assert.equal(await at('2026-12-27', '2026-12-28'), '2027-01-04');
  assert.equal(await at('2026-12-27', '2027-01-04'), '2027-01-04', 'the start day itself still counts');
  assert.equal(await at('2026-12-27', '2027-01-05'), '2027-02-01', 'late: the next start from today');
  assert.equal(await at('2027-01-24', '2027-01-25'), '2027-02-01');
  assert.equal(await at('2026-11-01', '2026-11-02'), '2026-11-02');
});

test('a term-1 student cannot open, track or download term-2 lessons, on any path', async () => {
  await rejects(h.as(asha)(`select my_lesson($1)`, [l2[0].id]), 'Lesson not found');
  await rejects(h.as(asha)(`select record_progress($1, 0, 10)`, [l2[0].id]), 'Not enrolled');
  await h.sql(`update lessons set kind = 'reading' where id = $1`, [l2[3].id]);
  await rejects(h.as(asha)(`select mark_reading_done($1)`, [l2[3].id]), 'Not enrolled');
  await h.sql(`update lessons set kind = 'video' where id = $1`, [l2[3].id]);
  assert.equal(await h.one(h.as(asha), `select can_read_material('bs-aiml/t2/notes.pdf')`), false);
  assert.equal(await h.one(h.as(asha), `select can_read_material('bs-aiml/t2/brief.pdf')`), false);
  assert.equal(await h.one(h.as(asha), `select can_read_material('bs-aiml/t1/notes.pdf')`), true);
  assert.deepEqual(await files(asha), ['bs-aiml/handbook.pdf', 'bs-aiml/t1/notes.pdf'], 'own term and program-wide files only');
  const course = await h.one(h.as(asha), `select my_course($1)`, [t1]);
  assert.deepEqual(course.modules.map((m) => [m.term, m.current]), [[1, true]]);
  assert.equal(course.batch.term, 1);
  assert.equal(course.batch.term_title, 'Python & computing');
  assert.equal(course.batch.terms, 12);
  // Progress somehow stored for a term-2 lesson never reaches the dashboard.
  await h.sql(`insert into lesson_progress (student_id, lesson_id, watched_seconds, last_position) values ($1, $2, 300, 300)`, [asha, l2[0].id]);
  const d = await h.one(h.as(asha), `select my_dashboard()`);
  assert.deepEqual(d.continue_watching, []);
  assert.equal(d.batches[0].lessons_total, 4);
  await h.sql(`delete from lesson_progress where student_id = $1 and lesson_id = $2`, [asha, l2[0].id]);
  // A term-1 lesson works as before.
  const own = await h.one(h.as(asha), `select my_lesson($1)`, [l1[0].id]);
  assert.deepEqual([own.can_track, own.index, own.total, own.term.no, own.next.id], [true, 1, 4, 1, l1[1].id]);
  assert.ok((await h.one(h.as(asha), `select record_progress($1, 0, 10)`, [l1[0].id])).watched_seconds > 0);
});

test('finishing term 1 reserves one seat in term 2 while the term still runs; the job is safe to re-run', async () => {
  await finishLessons(asha, 'bs-aiml', 1);
  await gradeAll(asha, t1, ['proficient', 'distinguished', 'proficient']);
  await finishLessons(ben, 'bs-aiml', 1);
  await gradeAll(ben, t1, ['proficient', 'proficient', 'basic']);            // project 3 needs a resubmission
  assert.equal(await h.one(h.service, `select progress_terms('2026-12-20')`), 1, 'the seat is reserved before the batch ends');
  assert.deepEqual(await enrollmentsOf(asha), [{ code: 'BSAIML-T1-2026-10', status: 'active' }, { code: 'BSAIML-T2-2027-01', status: 'reserved' }],
                   'term 1 stays active until its batch ends');
  assert.deepEqual(await enrollmentsOf(ben), [{ code: 'BSAIML-T1-2026-10', status: 'active' }]);

  await h.service(`select update_batch_statuses('2026-12-28')`);             // the day after the batch ended
  assert.deepEqual(await enrollmentsOf(asha), [{ code: 'BSAIML-T1-2026-10', status: 'completed' }, { code: 'BSAIML-T2-2027-01', status: 'reserved' }]);
  assert.deepEqual(await enrollmentsOf(ben), [{ code: 'BSAIML-T1-2026-10', status: 'active' }], 'a project not passed yet: no seat');
  assert.deepEqual(await enrollmentsOf(cara), [{ code: 'BSAIML-T1-2026-10', status: 'active' }]);

  const t2 = await batchId('BSAIML-T2-2027-01');
  assert.deepEqual((await h.sql(`select starts_on::text, status, term_no from batches where id = $1`, [t2])).rows[0],
                   { starts_on: '2027-01-04', status: 'scheduled', term_no: 2 });
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions where batch_id = $1`, [t2]), 24);
  assert.equal(await h.one(h.sql, `select count(*)::int from batch_assignments where batch_id = $1`, [t2]), 3);
  const note = (await h.as(asha)(`select title, body from notifications where kind = 'term_reserved'`)).rows;
  assert.equal(note.length, 1);
  assert.equal(note[0].title, 'Term 2: Mathematics for ML starts Jan 4, 2027. Your seat is reserved.');
  assert.equal(note[0].body, 'Your place in BSAIML-T2-2027-01 is held for you. It opens on its own on Jan 4, 2027.');

  const snapshot = async () => (await h.sql(`select (select count(*) from batches)::int b, (select count(*) from enrollments)::int e,
                                                  (select count(*) from notifications)::int n`)).rows[0];
  const was = await snapshot();
  for (const day of ['2026-12-20', '2026-12-28', '2026-12-29', '2027-01-03']) await h.service(`select update_batch_statuses($1)`, [day]);
  assert.deepEqual(await snapshot(), was, 'running the job again creates nothing');
});

test('a reserved seat opens nothing before its start date, then opens on its own; completed terms stay open for review', async () => {
  const t2 = await batchId('BSAIML-T2-2027-01');
  await rejects(h.as(asha)(`select my_lesson($1)`, [l2[0].id]), 'Lesson not found');
  await rejects(h.as(asha)(`select my_course($1)`, [t2]), 'Batch not found');
  await rejects(h.as(asha)(`select my_sessions($1)`, [t2]), 'Batch not found');
  await rejects(h.as(asha)(`select record_progress($1, 0, 10)`, [l2[0].id]), 'Not enrolled');
  assert.equal(await h.one(h.as(asha), `select can_read_material('bs-aiml/t2/notes.pdf')`), false);
  assert.equal(await h.one(h.as(asha), `select count(*)::int from sessions`), 0, 'no batch visible');
  const d = await h.one(h.as(asha), `select my_dashboard()`);
  assert.deepEqual(d.batches, []);
  assert.deepEqual(d.reserved.map((r) => [r.code, r.term, r.term_title, r.starts_on]), [['BSAIML-T2-2027-01', 2, 'Mathematics for ML', '2027-01-04']]);
  // The completed term is still there to review.
  assert.equal((await h.one(h.as(asha), `select my_lesson($1)`, [l1[2].id])).can_track, true);
  assert.equal(await h.one(h.as(asha), `select can_read_material('bs-aiml/t1/notes.pdf')`), true);

  // The start date (New York): the seat opens with no admin step, and the 30 days for tuition count from the start.
  await h.service(`select update_batch_statuses('2027-01-04')`);
  const seat = await enrollmentId(asha, 'BSAIML-T2-2027-01');
  assert.deepEqual(await enrollmentsOf(asha), [{ code: 'BSAIML-T1-2026-10', status: 'completed' }, { code: 'BSAIML-T2-2027-01', status: 'active' }]);
  assert.equal(await h.one(h.sql, `select ((access_of($1, '2027-01-05 12:00-05')).grace_start at time zone 'America/New_York')::text`, [seat]),
               '2027-01-04 00:00:00', 'the unpaid rule counts from 00:00 on the start date in New York');
  assert.equal(await h.one(h.sql, `select (access_of($1, '2027-02-02 23:59-05')).state`, [seat]), 'grace');
  assert.equal(await h.one(h.sql, `select (access_of($1, '2027-02-03 00:01-05')).state`, [seat]), 'stopped_unpaid');
  const started = (await h.as(asha)(`select title, body from notifications where kind = 'term_started'`)).rows;
  assert.deepEqual(started, [{ title: 'Term 2: Mathematics for ML has started',
    body: 'Your seat in BSAIML-T2-2027-01 is now active. This term\'s lessons, live classes and projects are open in the portal.' }]);
  const was = await h.one(h.sql, `select count(*)::int from notifications`);
  await h.service(`select update_batch_statuses('2027-01-05')`);
  assert.equal(await h.one(h.sql, `select count(*)::int from notifications`), was, 'opened once');
  const lesson = await h.one(h.as(asha), `select my_lesson($1)`, [l2[0].id]);
  assert.deepEqual([lesson.term.no, lesson.term.title, lesson.index, lesson.total, lesson.prev], [2, 'Mathematics for ML', 1, 4, null]);
  const course = await h.one(h.as(asha), `select my_course($1)`, [t2]);
  assert.deepEqual(course.modules.map((m) => [m.term, m.current]), [[1, false], [2, true]], 'term 1 for review, term 2 current');
  assert.equal(await h.one(h.as(asha), `select can_read_material('bs-aiml/t2/notes.pdf')`), true);
  assert.ok((await h.one(h.as(asha), `select record_progress($1, 0, 20)`, [l2[0].id])).watched_seconds >= 20);
  assert.deepEqual((await h.one(h.as(asha), `select my_dashboard()`)).batches.map((b) => [b.code, b.lessons_total]), [['BSAIML-T2-2027-01', 4]]);
});

test('a student who finishes late is picked up by a later run and joins the next start from that day', async () => {
  const p3 = await h.one(h.sql, `select id from batch_assignments where batch_id = $1 order by due_at desc limit 1`, [t1]);
  await h.as(ben)(`select submit_assignment($1, 'https://github.com/ben/project-3-v2')`, [p3]);
  const sub = await h.one(h.sql, `select id from submissions where assignment_id = $1 and student_id = $2`, [p3, ben]);
  await h.as(inst)(`select grade_submission($1, 'proficient')`, [sub]);
  await h.service(`select update_batch_statuses('2027-01-10')`);            // the Jan 4 batch has already started
  assert.deepEqual(await enrollmentsOf(ben), [{ code: 'BSAIML-T1-2026-10', status: 'completed' }, { code: 'BSAIML-T2-2027-02', status: 'reserved' }]);
  assert.equal((await enrollmentsOf(asha)).length, 2, 'students who already moved on get nothing new');
});

test('admins can mark a term completed: the seat is reserved at once; an admin can pause it before it opens', async () => {
  const dan = await h.user('dan@test.io');
  const ds = await h.one(h.service, `select create_batch('bs-ds', '2026-11-02')`);
  await h.service(`select enroll_student($1, 'bs-ds', '2026-11-02')`, [dan]);
  await rejects(h.as(asha)(`select admin_set_enrollment_status($1, 'completed')`, [await enrollmentId(dan, 'BSDS-T1-2026-11')]), 'Admins only');
  await h.as(admin)(`select admin_set_enrollment_status($1, 'completed')`, [await enrollmentId(dan, 'BSDS-T1-2026-11')]);
  await h.service(`select update_batch_statuses('2026-11-20')`);
  assert.deepEqual(await enrollmentsOf(dan), [{ code: 'BSDS-T1-2026-11', status: 'completed' }, { code: 'BSDS-T2-2027-02', status: 'reserved' }],
                   'reserved while the batch still runs');
  await h.service(`select update_batch_statuses('2027-01-25')`);
  assert.equal(await h.one(h.sql, `select status from batches where id = $1`, [ds]), 'completed');
  // Paused by an admin before the start: the start date leaves it paused.
  await h.as(admin)(`select admin_set_enrollment_status($1, 'paused')`, [await enrollmentId(dan, 'BSDS-T2-2027-02')]);
  await h.service(`select update_batch_statuses('2027-02-01')`);
  assert.deepEqual(await enrollmentsOf(dan), [{ code: 'BSDS-T1-2026-11', status: 'completed' }, { code: 'BSDS-T2-2027-02', status: 'paused' }]);
  // Cara never finished term 1, and nobody marked it: she keeps her term-1 access and gets no seat.
  assert.deepEqual(await enrollmentsOf(cara), [{ code: 'BSAIML-T1-2026-10', status: 'active' }]);
  await rejects(h.as(admin)(`select admin_set_enrollment_status($1, 'finished')`, [await enrollmentId(dan, 'BSDS-T1-2026-11')]), 'Invalid status');
});

test('completing the final term completes the program: no further seat', async () => {
  const eve = await h.user('eve@test.io');
  const cpy = await h.one(h.service, `select create_batch('c-py', '2026-10-05')`);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [cpy, inst]);
  await h.service(`select enroll_student($1, 'c-py', '2026-10-05')`, [eve]);
  await finishLessons(eve, 'c-py', 1);
  await gradeAll(eve, cpy, ['proficient', 'proficient', 'distinguished']);
  // And the twelfth term of a bachelor's program.
  const fay = await h.user('fay@test.io');
  const last = await h.one(h.service, `select create_batch('bs-ds', '2026-10-05', 12)`);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [last, inst]);
  await h.sql(`insert into enrollments (student_id, batch_id, program_id, source) values ($1, $2, 'bs-ds', 'admin')`, [fay, last]);
  await finishLessons(fay, 'bs-ds', 12);
  await gradeAll(fay, last, ['proficient', 'proficient', 'proficient']);

  await h.service(`select update_batch_statuses('2026-12-28')`);
  await h.service(`select update_batch_statuses('2026-12-29')`);
  assert.deepEqual(await enrollmentsOf(eve), [{ code: 'CPY-T1-2026-10', status: 'completed' }]);
  assert.deepEqual(await enrollmentsOf(fay), [{ code: 'BSDS-T12-2026-10', status: 'completed' }]);
  assert.equal(await h.one(h.sql, `select count(*)::int from notifications where kind = 'term_reserved' and user_id in ($1, $2)`, [eve, fay]), 0);
});

test('transfers stay within one term, and reserved seats count toward capacity', async () => {
  const t2 = await batchId('BSAIML-T2-2027-01');
  await rejects(h.as(admin)(`select admin_transfer($1, $2)`, [await enrollmentId(cara, 'BSAIML-T1-2026-10'), t2]), 'same program and term');
  const dec = await h.one(h.service, `select create_batch('bs-aiml', '2026-12-07')`);
  await h.sql(`update batches set capacity = 1 where id = $1`, [dec]);
  const gus = await h.user('gus@test.io');
  const e = await h.one(h.service, `select enroll_student($1, 'bs-aiml', '2026-12-07')`, [gus]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'reserved')`, [e]);
  await rejects(h.service(`select enroll_student($1, 'bs-aiml', '2026-12-07')`, [await h.user('hal@test.io')]), 'is full');
  // Activating a reserved seat while another enrollment of the program is active is refused clearly.
  const t2ben = await enrollmentId(ben, 'BSAIML-T2-2027-02');
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [t2ben]);
  await h.sql(`insert into enrollments (student_id, batch_id, program_id, status) values ($1, $2, 'bs-aiml', 'reserved')`, [ben, t2]);
  await rejects(h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [await enrollmentId(ben, 'BSAIML-T2-2027-01')]), 'already has an active enrollment');
});
