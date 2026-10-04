// The admin area over HTTP, as the portal will use it: PDF uploads to the private course-files bucket (admins
// only, PDF only, at most 50 MB, never replacing a file), attaching them to a lesson, students downloading
// exactly what was uploaded, deleting; and the demo's tuition situations, as students and admins see them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/dev-server.mjs';
import { ACCOUNTS, DEMO_PASSWORD } from '../../server/demo-accounts.mjs';

let s, H, tok = {};
before(async () => {
  s = await startServer({ port: 0, quiet: true, testApi: true });
  H = { apikey: s.anonKey, 'Content-Type': 'application/json' };
  for (const who of ['admin', 'student', 'instructor', 'otherProgram', 'grace', 'lapsed', 'stopped', 'extended']) {
    const r = await fetch(`${s.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: H,
      body: JSON.stringify({ email: ACCOUNTS[who].email, password: DEMO_PASSWORD }) });
    tok[who] = (await r.json()).access_token;
  }
});
after(() => s.close());

const auth = (who) => (who ? { Authorization: `Bearer ${tok[who]}` } : {});
const rpc = async (fn, args, who) => {
  const r = await fetch(`${s.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...H, ...auth(who) }, body: JSON.stringify(args ?? {}) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};
const sql = async (text, params = []) => (await (await fetch(`${s.url}/__test/sql`, { method: 'POST',
  headers: { 'X-Nuvora-Test': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: text, params }) })).json());
const upload = (path, body, who = 'admin', type = 'application/pdf', extra = {}) => fetch(`${s.url}/storage/v1/object/course-files/${path}`,
  { method: 'POST', headers: { apikey: s.anonKey, ...auth(who), 'Content-Type': type, ...extra }, body });
const sign = (path, who, expiresIn = 60) => fetch(`${s.url}/storage/v1/object/sign/course-files/${path}`,
  { method: 'POST', headers: { ...H, ...auth(who) }, body: JSON.stringify({ expiresIn }) });
const remove = (paths, who = 'admin') => fetch(`${s.url}/storage/v1/object/course-files`,
  { method: 'DELETE', headers: { ...H, ...auth(who) }, body: JSON.stringify({ prefixes: paths }) });
const pdf = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`, 'latin1');
const stored = async (name) => (await sql(`select count(*)::int n from storage.objects where name = $1`, [name]))[0].n;

test('admins upload PDFs; students download exactly that file once it is attached to their lesson', async () => {
  const path = 'ms-ds/lessons/upload-test/week-1-notes.pdf';
  const bytes = pdf('Week 1 notes, uploaded by an admin');
  let r = await upload(path, bytes);
  assert.equal(r.status, 200);
  const up = await r.json();
  assert.equal(up.Key, `course-files/${path}`);
  assert.match(up.Id, /^[0-9a-f-]{36}$/);
  r = await upload(path, pdf('replacement'));
  assert.equal(r.status, 409, 'a file is never replaced');
  assert.equal((await r.json()).error, 'Duplicate');

  assert.equal((await sign(path, 'otherProgram')).status, 400, 'not attached yet: students cannot see it');
  assert.equal((await sign(path, 'admin')).status, 200, 'admins can check an unattached file');
  const lesson = (await sql(`select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'ms-ds' and m.term_no = 1
                             order by l.position limit 1`))[0].id;
  const add = await rpc('admin_add_material', { p_file_path: path, p_title: 'Week 1 notes', p_lesson: lesson }, 'admin');
  assert.equal(add.status, 200);
  assert.deepEqual([add.body.title, add.body.size_bytes, add.body.lesson.id], ['Week 1 notes', bytes.length, lesson]);
  assert.equal((await rpc('admin_add_material', { p_file_path: path, p_title: 'Again', p_lesson: lesson }, 'admin')).status, 409);

  r = await sign(path, 'otherProgram');
  assert.equal(r.status, 200);
  const got = await fetch(`${s.url}/storage/v1${(await r.json()).signedURL}&download=notes.pdf`);
  assert.equal(got.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), bytes, 'the uploaded bytes, unchanged');
  assert.equal((await sign(path, 'lapsed')).status, 400, 'a student whose access stopped gets nothing');
  assert.equal((await sign(path, 'student')).status, 400, 'nor a student of another program');

  r = await remove([path]);
  assert.deepEqual(await r.json(), [], 'an attached file is not deleted');
  const detached = await rpc('admin_remove_material', { p_material: add.body.id }, 'admin');
  assert.deepEqual(detached.body, { id: add.body.id, file_path: path });
  assert.equal((await sign(path, 'otherProgram')).status, 400, 'students stop seeing it at once');
  r = await remove([path, 'ms-ds/lessons/upload-test/never-uploaded.pdf']);
  assert.deepEqual((await r.json()).map((x) => x.name), [path]);
  assert.equal(await stored(path), 0);
  assert.equal((await upload(path, bytes)).status, 200, 'the name can be used again once deleted');
});

test('uploads refuse anything but PDFs, files over 50 MB, bad paths and everyone but admins', async () => {
  const base = 'ms-ds/lessons/refused';
  const cases = [
    ['text/plain', `${base}/notes.pdf`, pdf('x'), 'admin', 415, 'invalid_mime_type'],
    ['video/mp4', `${base}/lecture.mp4`, Buffer.from('....ftypmp42'), 'admin', 415, 'invalid_mime_type'],
    ['application/pdf', `${base}/fake.pdf`, Buffer.from('<html>not a pdf</html>'), 'admin', 415, 'invalid_pdf'],
    ['application/pdf', `${base}/movie.mp4`, pdf('x'), 'admin', 403, 'Unauthorized'],
    ['application/pdf', 'nowhere/notes.pdf', pdf('x'), 'admin', 403, 'Unauthorized'],
    ['application/pdf', 'ms-ds/..%2Fbs-aiml/notes.pdf', pdf('x'), 'admin', 403, 'Unauthorized'],
    ['application/pdf', `${base}/by-student.pdf`, pdf('x'), 'student', 403, 'Unauthorized'],
    ['application/pdf', `${base}/by-instructor.pdf`, pdf('x'), 'instructor', 403, 'Unauthorized'],
    ['application/pdf', `${base}/by-visitor.pdf`, pdf('x'), null, 403, 'Unauthorized'],
  ];
  for (const [type, path, body, who, status, error] of cases) {
    const r = await upload(path, body, who, type);
    assert.equal(r.status, status, `${who} ${type} ${path}`);
    assert.equal((await r.json()).error, error, path);
  }
  const big = Buffer.alloc(50 * 1024 * 1024 + 1, 0x20);
  big.write('%PDF-1.4\n', 'latin1');
  let r = await upload(`${base}/huge.pdf`, big);
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error, 'Payload too large');
  r = await fetch(`${s.url}/storage/v1/object/course-files/${base}/no-key.pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf('x') });
  assert.equal(r.status, 401, 'an API key is required');
  r = await upload(`${base}/x.pdf`, pdf('x'), 'admin', 'application/pdf', {});
  assert.equal(r.status, 200);
  r = await fetch(`${s.url}/storage/v1/object/other-bucket/x.pdf`, { method: 'POST', headers: { apikey: s.anonKey, ...auth('admin'), 'Content-Type': 'application/pdf' }, body: pdf('x') });
  assert.equal(r.status, 404);
  assert.deepEqual(await (await remove([`${base}/x.pdf`], 'student')).json(), [], 'students cannot delete');
  assert.deepEqual(await (await remove([`${base}/x.pdf`], 'instructor')).json(), [], 'nor instructors');
  assert.equal((await (await sql(`select name from storage.objects where name like $1 order by name`, [`${base}/%`]))).map((x) => x.name).join(), `${base}/x.pdf`,
               'nothing refused was stored');
});

test('the demo shows each tuition situation, the same way to the student and to admins', async () => {
  const states = {};
  for (const who of ['student', 'otherProgram', 'grace', 'lapsed', 'stopped', 'extended']) {
    const d = (await rpc('my_dashboard', {}, who)).body;
    states[who] = [d.access[0].state, d.batches.length, d.access[0].days_left];
  }
  assert.deepEqual(states, {
    student: ['paid', 1, null], otherProgram: ['paid', 1, null], grace: ['grace', 1, 10], lapsed: ['stopped_unpaid', 0, null],
    stopped: ['stopped_manual', 0, null], extended: ['started_manual', 1, 14],
  });
  const o = (await rpc('admin_overview', {}, 'admin')).body;
  assert.deepEqual([o.paid, o.in_grace, o.stopped_unpaid, o.stopped_manual, o.started_manual], [3, 2, 1, 1, 1]);
  assert.ok(o.new_seat_requests >= 2);
  const kenji = o.stopped.find((x) => x.email === ACCOUNTS.lapsed.email);
  assert.ok(kenji.since, 'the hourly job recorded the stop when the demo loaded');
  const notes = (await rpc('my_notifications', {}, 'lapsed')).body.items.filter((n) => n.kind === 'access_stopped');
  assert.equal(notes.length, 1);
  assert.equal((await rpc('admin_overview', {}, 'student')).status, 403);
  assert.equal((await rpc('admin_overview', {})).status, 401);
  assert.equal((await rpc('apply_access_rules', {}, 'admin')).status, 403, 'the hourly job is not callable through the API');
});

// A signed PDF link is checked once, when it is made; the download itself only checks the link. So links must be
// short: the portal asks for 60 seconds and the local server never signs for more than an hour (hosted Supabase
// has no maximum, see docs/admin-api.md). Once access stops, no new link is given, and the old one runs out.
test('a PDF link made while access is open is short-lived: after a stop it runs out on time and is not renewed', async () => {
  const enrollment = (await rpc('my_dashboard', {}, 'grace')).body.access[0].enrollment_id;
  const [mat] = await sql(`select mt.file_path from materials mt join lessons l on l.id = mt.lesson_id join modules m on m.id = l.module_id
                           join enrollments e on e.program_id = m.program_id join batches b on b.id = e.batch_id and b.term_no = m.term_no
                           where e.id = $1 order by mt.position, mt.file_path limit 1`, [enrollment]);
  assert.ok(mat, 'the demo has a PDF in Ines\'s term');
  const life = async (r) => {
    const token = new URL((await r.json()).signedURL, 'http://x').searchParams.get('token');
    const c = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return c.exp - c.iat;
  };
  assert.equal(await life(await sign(mat.file_path, 'grace', 10 * 365 * 86400)), 3600, 'ten years asked, one hour given');
  let r = await sign(mat.file_path, 'grace', 2);
  assert.equal(r.status, 200, 'in the 30 days: the link is given');
  const { signedURL } = await r.json();

  assert.equal((await rpc('admin_set_access', { p_enrollment: enrollment, p_mode: 'off', p_reason: 'Link test' }, 'admin')).status, 200);
  try {
    assert.equal((await sign(mat.file_path, 'grace', 2)).status, 400, 'after the stop: no new link');
    await new Promise((res) => setTimeout(res, 2500));
    r = await fetch(`${s.url}/storage/v1${signedURL}`);
    assert.equal(r.status, 400, 'and the old one has run out');
  } finally {
    assert.equal((await rpc('admin_set_access', { p_enrollment: enrollment, p_mode: 'auto' }, 'admin')).status, 200);
  }
});
