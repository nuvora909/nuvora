// Assignments: submission, privacy, grading by the right instructor, resubmission and the mastery rule.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, a, b, c, iOct, iNov, task, subA;

before(async () => {
  h = await freshDb();
  const oct = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  const nov = await h.one(h.service, `select create_batch('bs-aiml', '2026-11-02')`);
  a = await h.user('asha@test.io');
  b = await h.user('ben@test.io');
  c = await h.user('cara@test.io');
  iOct = await h.user('oct.instructor@test.io', 'instructor');
  iNov = await h.user('nov.instructor@test.io', 'instructor');
  const admin = await h.user('admin@test.io', 'admin');
  for (const s of [a, b]) await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [s]);
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-11-02')`, [c]);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [oct, iOct]);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [nov, iNov]);
  task = await h.one(h.sql, `select id from batch_assignments where batch_id = $1 order by due_at limit 1`, [oct]);
});

test('a student submits a link to their own batch\'s assignment', async () => {
  subA = await h.one(h.as(a), `select submit_assignment($1, 'https://github.com/asha/project-1')`, [task]);
  assert.ok(subA);
});

test('submissions need an https link or a file', async () => {
  await rejects(h.as(b)(`select submit_assignment($1, 'http://insecure.example')`, [task]), 'https://');
  await rejects(h.as(b)(`select submit_assignment($1, '  ', null)`, [task]), 'Add a link or a file');
  await rejects(h.as(b)(`select submit_assignment($1, 'javascript:alert(1)')`, [task]), 'https://');
});

test('oversized links, notes and feedback are refused', async () => {
  await rejects(h.as(b)(`select submit_assignment($1, $2)`, [task, 'https://x.io/' + 'a'.repeat(500)]), '500 characters');
  await rejects(h.as(b)(`select submit_assignment($1, 'https://x.io', null, $2)`, [task, 'n'.repeat(2001)]), '2000');
  await rejects(h.as(iOct)(`select grade_submission(gen_random_uuid(), 'basic', $1)`, ['f'.repeat(5001)]), '5000 characters');
  assert.equal(await h.one(h.sql, `select count(*)::int from submissions where student_id = $1`, [b]), 0);
});

test('classmates cannot see each other\'s work', async () => {
  assert.equal(await h.one(h.as(b), `select count(*)::int from submissions`), 0);
});

test('students from another batch cannot submit to this one', async () => {
  await rejects(h.as(c)(`select submit_assignment($1, 'https://x.example')`, [task]), 'not part of your batch');
});

test('only this batch\'s instructor can grade', async () => {
  await rejects(h.as(iNov)(`select grade_submission($1, 'proficient')`, [subA]), 'Only this batch');
  assert.equal(await h.one(h.as(iNov), `select count(*)::int from submissions`), 0);
  assert.equal(await h.one(h.as(iOct), `select count(*)::int from submissions`), 1);
  await rejects(h.as(a)(`select grade_submission($1, 'distinguished')`, [subA]), 'Only this batch');
});

test('Basic asks for a resubmission; the next attempt can pass', async () => {
  await h.as(iOct)(`select grade_submission($1, 'basic', 'Add evaluation on a held-out set')`, [subA]);
  assert.equal(await h.one(h.sql, `select status from submissions where id = $1`, [subA]), 'needs_resubmission');
  await rejects(h.as(iOct)(`select grade_submission($1, 'proficient')`, [subA]), 'Nothing new to grade');

  await h.as(a)(`select submit_assignment($1, 'https://github.com/asha/project-1-v2')`, [task]);
  const row = (await h.sql(`select status, attempt, grade from submissions where id = $1`, [subA])).rows[0];
  assert.deepEqual(row, { status: 'submitted', attempt: 2, grade: null });

  await h.as(iOct)(`select grade_submission($1, 'proficient', 'Solid work')`, [subA]);
  assert.equal(await h.one(h.sql, `select status from submissions where id = $1`, [subA]), 'graded');
});

test('a passed assignment cannot be resubmitted', async () => {
  await rejects(h.as(a)(`select submit_assignment($1, 'https://github.com/asha/again')`, [task]), 'Already passed');
});

test('the dashboard shows each assignment\'s status, and unsubmitted past-due work as overdue', async () => {
  const dash = await h.one(h.as(a), `select my_dashboard()`);
  const first = dash.batches[0].assignments[0];
  assert.equal(first.status, 'graded');
  assert.equal(first.grade, 'proficient');
  assert.equal(first.attempt, 2);
  const later = await h.one(h.as(b), `select my_dashboard('2027-06-01')`);
  assert.ok(later.batches[0].assignments.every((x) => x.status === 'overdue'));
});

test('students are notified when work is reviewed', async () => {
  assert.equal(await h.one(h.as(a), `select count(*)::int from notifications where kind = 'graded'`), 2);
});
