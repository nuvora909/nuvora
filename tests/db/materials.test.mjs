// PDF materials: downloadable only by students actively enrolled in the program (plus its staff and admins),
// PDF-only, private bucket, and nobody but admins can add or change files.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, a, d, paused, none, iOct, admin, oct, aimlLesson, msLesson, aimlTemplate;
const visibleFiles = async (fn) => (await fn(`select name from storage.objects where bucket_id = 'course-files' order by name`)).rows.map((r) => r.name);

before(async () => {
  h = await freshDb();
  oct = await h.one(h.service, `select create_batch('bs-aiml', '2026-10-05')`);
  a = await h.user('asha@test.io');
  d = await h.user('dev@test.io');
  paused = await h.user('paused@test.io');
  none = await h.user('none@test.io');
  iOct = await h.user('oct.instructor@test.io', 'instructor');
  admin = await h.user('admin@test.io', 'admin');
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [a]);
  await h.service(`select enroll_student($1, 'ms-ds', '2026-10-05')`, [d]);
  const pe = await h.one(h.service, `select enroll_student($1, 'bs-aiml', '2026-10-05')`, [paused]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'paused')`, [pe]);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [oct, iOct]);

  aimlLesson = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' order by m.position, l.position limit 1`);
  msLesson = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'ms-ds' order by m.position, l.position limit 1`);
  aimlTemplate = await h.one(h.sql, `select id from assignment_templates where program_id = 'bs-aiml' order by due_offset_days limit 1`);
  await h.service(`insert into materials (program_id, lesson_id, title, file_path, size_bytes) values
                   ('bs-aiml', $1, 'Lecture notes', 'bs-aiml/lessons/mth-110/notes.pdf', 120000),
                   ('bs-aiml', $1, 'Exercise sheet', 'bs-aiml/lessons/mth-110/exercises.pdf', 40000),
                   ('ms-ds', $2, 'Lecture notes', 'ms-ds/lessons/first/notes.pdf', 90000)`, [aimlLesson, msLesson]);
  await h.service(`insert into materials (program_id, assignment_template_id, title, file_path) values
                   ('bs-aiml', $1, 'Project brief', 'bs-aiml/assignments/p1/brief.pdf')`, [aimlTemplate]);
  await h.service(`insert into storage.buckets (id, name) values ('other', 'other')`);
  await h.service(`insert into storage.objects (bucket_id, name) select 'course-files', file_path from materials`);
  await h.service(`insert into storage.objects (bucket_id, name) values ('other', 'bs-aiml/secret.pdf')`);
});

test('the course-files bucket is private and accepts PDFs only', async () => {
  const b = (await h.sql(`select public, allowed_mime_types from storage.buckets where id = 'course-files'`)).rows[0];
  assert.deepEqual(b, { public: false, allowed_mime_types: ['application/pdf'] });
});

test('lesson and assignment pages list their PDFs; the course page counts them', async () => {
  const lesson = await h.one(h.as(a), `select my_lesson($1)`, [aimlLesson]);
  assert.deepEqual(lesson.materials.map((m) => m.title), ['Exercise sheet', 'Lecture notes']);
  assert.equal(lesson.materials[1].file_path, 'bs-aiml/lessons/mth-110/notes.pdf');
  const tasks = await h.one(h.as(a), `select my_assignments($1)`, [oct]);
  assert.deepEqual(tasks[0].materials.map((m) => m.title), ['Project brief']);
  assert.deepEqual(tasks[1].materials, []);
  const course = await h.one(h.as(a), `select my_course($1)`, [oct]);
  assert.equal(course.modules[0].lessons[0].pdfs, 2);
});

test('enrolled students can download only their own program\'s PDFs', async () => {
  assert.deepEqual(await visibleFiles(h.as(a)), [
    'bs-aiml/assignments/p1/brief.pdf', 'bs-aiml/lessons/mth-110/exercises.pdf', 'bs-aiml/lessons/mth-110/notes.pdf']);
  assert.deepEqual(await visibleFiles(h.as(d)), ['ms-ds/lessons/first/notes.pdf']);
});

test('paused, unenrolled and signed-out users can download nothing', async () => {
  assert.deepEqual(await visibleFiles(h.as(paused)), []);
  assert.deepEqual(await visibleFiles(h.as(none)), []);
  assert.deepEqual(await visibleFiles(h.anon), []);
});

test('instructors get their program\'s files; admins get all', async () => {
  assert.equal((await visibleFiles(h.as(iOct))).length, 3);
  assert.equal((await visibleFiles(h.as(admin))).length, 4);
});

test('files in other buckets are never exposed by this rule', async () => {
  assert.equal((await h.as(a)(`select count(*)::int n from storage.objects where bucket_id = 'other'`)).rows[0].n, 0);
});

test('nobody but the server can add, change or delete files', async () => {
  for (const who of [a, iOct, admin]) {
    await rejects(h.as(who)(`insert into storage.objects (bucket_id, name) values ('course-files', 'bs-aiml/evil.pdf')`), '42501');
    const upd = await h.as(who)(`update storage.objects set name = 'bs-aiml/renamed.pdf' where bucket_id = 'course-files'`);
    assert.equal(upd.affectedRows ?? 0, 0);
    const del = await h.as(who)(`delete from storage.objects where bucket_id = 'course-files'`);
    assert.equal(del.affectedRows ?? 0, 0);
  }
  assert.equal((await h.sql(`select count(*)::int n from storage.objects where bucket_id = 'course-files'`)).rows[0].n, 4);
});

test('materials must be PDFs inside their own program\'s folder', async () => {
  await rejects(h.service(`insert into materials (program_id, title, file_path) values ('bs-aiml', 'Video', 'bs-aiml/lesson.mp4')`), '23514');
  await rejects(h.service(`insert into materials (program_id, title, file_path) values ('bs-aiml', 'Wrong folder', 'ms-ds/notes.pdf')`), '23514');
  await rejects(h.service(`insert into materials (program_id, title, file_path) values ('bs-aiml', 'Escape', 'bs-aiml/../ms-ds/notes.pdf')`), '23514');
  await rejects(h.service(`insert into materials (program_id, title, file_path) values ('bs-aiml', 'Script', 'bs-aiml/notes.pdf.js')`), '23514');
});

test('the materials table itself is not readable through the API', async () => {
  await rejects(h.as(a)(`select * from materials`), '42501');
  await rejects(h.anon(`select * from materials`), '42501');
  assert.equal(await h.one(h.as(a), `select can_read_material('bs-aiml/does-not-exist.pdf')`), false);
});
