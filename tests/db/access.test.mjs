// The key rule: every student sees only their own active batch. Checked for students, staff, admins and visitors.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, ids;

before(async () => {
  h = await freshDb();
  const oct = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  const nov = await h.one(h.service, `select create_batch('bs-aiml', '2026-11-02')`);
  const msds = await h.one(h.service, `select create_batch('ms-ds', '2026-10-05')`);
  const aOct = await h.user('asha@test.io');
  const bNov = await h.user('ben@test.io');
  const cNone = await h.user('cara@test.io');
  const dMsds = await h.user('dev@test.io');
  const inst = await h.user('instructor@test.io', 'instructor');
  const admin = await h.user('admin@test.io', 'admin');
  const eA = await h.one(h.service, `select enroll_student($1, 'bs-aiml', '2026-10-05')`, [aOct]);
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-11-02')`, [bNov]);
  await h.service(`select enroll_student($1, 'ms-ds', '2026-10-05')`, [dMsds]);
  await h.as(admin)(`select admin_assign_staff($1, $2, 'instructor')`, [oct, inst]);
  await h.sql(`update sessions set join_url = 'https://zoom.us/j/secret-' || id where batch_id = $1`, [nov]);
  ids = { oct, nov, msds, aOct, bNov, cNone, dMsds, inst, admin, eA };
});

const visible = async (user, table) =>
  (await h.as(user)(`select distinct batch_id::text as b from ${table}`)).rows.map((r) => r.b).sort();

test('a student sees only their own batch, its sessions and assignments', async () => {
  const { aOct, oct } = ids;
  assert.deepEqual((await h.as(aOct)(`select code from batches`)).rows.map((r) => r.code), ['BSAIML-T1-2026-10']);
  assert.deepEqual(await visible(aOct, 'sessions'), [oct]);
  assert.deepEqual(await visible(aOct, 'batch_assignments'), [oct]);
  assert.equal(await h.one(h.as(aOct), `select count(*)::int from sessions`), 24);
});

test('students in another batch or program are fully separated', async () => {
  const { bNov, dMsds, nov, msds } = ids;
  assert.deepEqual(await visible(bNov, 'sessions'), [nov]);
  assert.deepEqual(await visible(dMsds, 'sessions'), [msds]);
});

test('a signed-in user with no enrollment sees nothing', async () => {
  const { cNone } = ids;
  for (const t of ['batches', 'sessions', 'batch_assignments', 'enrollments', 'submissions', 'lesson_progress', 'attendance']) {
    assert.equal(await h.one(h.as(cNone), `select count(*)::int from ${t}`), 0, t);
  }
});

test('join links of other batches never leak', async () => {
  const { aOct, nov } = ids;
  await rejects(h.as(aOct)(`select join_url from sessions`), '42501');
  await rejects(h.as(aOct)(`select my_sessions($1)`, [nov]), 'Batch not found');
  const dash = await h.one(h.as(aOct), `select my_dashboard()`);
  assert.equal(JSON.stringify(dash).includes('secret'), false);
});

test('signed-out visitors can read the public catalog but no batch data', async () => {
  assert.equal(await h.one(h.anon, `select count(*)::int from programs`), 7);
  assert.ok(await h.one(h.anon, `select count(*)::int from modules`) > 0);
  assert.ok(await h.one(h.anon, `select count(*)::int from lessons`) > 0, 'syllabus titles are public');
  await rejects(h.anon(`select * from sessions`), '42501');
  await rejects(h.anon(`select * from enrollments`), '42501');
  await rejects(h.anon(`select video_asset_id from lessons`), '42501');
});

test('an instructor sees only the batch they teach and its students', async () => {
  const { inst, oct, aOct, bNov } = ids;
  assert.deepEqual(await visible(inst, 'sessions'), [oct]);
  const people = (await h.as(inst)(`select id::text from profiles`)).rows.map((r) => r.id);
  assert.ok(people.includes(aOct), 'sees own student');
  assert.ok(!people.includes(bNov), 'does not see another batch');
});

test('an admin sees every batch', async () => {
  assert.equal(await h.one(h.as(ids.admin), `select count(*)::int from batches`), 3);
});

test('students can only read and rename themselves, never change role or enroll themselves', async () => {
  const { aOct, bNov, oct } = ids;
  assert.deepEqual((await h.as(aOct)(`select id::text from profiles`)).rows.map((r) => r.id), [aOct]);
  await rejects(h.as(aOct)(`update profiles set role = 'admin' where id = $1`, [aOct]), '42501');
  await rejects(h.as(aOct)(`insert into enrollments (student_id, batch_id, program_id) values ($1, $2, 'bs-aiml')`, [aOct, oct]), '42501');
  await h.as(aOct)(`update profiles set full_name = 'Asha R.' where id = $1`, [aOct]);
  assert.equal(await h.one(h.sql, `select full_name from profiles where id = $1`, [aOct]), 'Asha R.');
  await h.as(aOct)(`update profiles set full_name = 'hacked' where id = $1`, [bNov]);
  assert.notEqual(await h.one(h.sql, `select full_name from profiles where id = $1`, [bNov]), 'hacked');
});

test('pausing an enrollment hides the batch; reactivating restores it', async () => {
  const { admin, aOct, eA } = ids;
  await h.as(admin)(`select admin_set_enrollment_status($1, 'paused')`, [eA]);
  assert.equal(await h.one(h.as(aOct), `select count(*)::int from sessions`), 0);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [eA]);
  assert.equal(await h.one(h.as(aOct), `select count(*)::int from sessions`), 24);
});

test('transferring a student switches their access immediately', async () => {
  const { admin, aOct, eA, nov } = ids;
  await h.as(admin)(`select admin_transfer($1, $2)`, [eA, nov]);
  assert.deepEqual(await visible(aOct, 'sessions'), [nov]);
  const dash = await h.one(h.as(aOct), `select my_dashboard()`);
  assert.deepEqual(dash.batches.map((b) => b.code), ['BSAIML-T1-2026-11']);
});

test('the student dashboard only contains the caller\'s batches', async () => {
  const { cNone, dMsds } = ids;
  assert.deepEqual((await h.one(h.as(cNone), `select my_dashboard()`)).batches, []);
  assert.deepEqual((await h.one(h.as(dMsds), `select my_dashboard()`)).batches.map((b) => b.code), ['MSDS-T1-2026-10']);
});
