// The local server must behave like Supabase where the portal depends on it, and must refuse what
// Supabase refuses: bad or tampered tokens, unknown functions, injection attempts, foreign hosts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../../server/dev-server.mjs';
import { signJwt } from '../../server/auth.mjs';
import { ACCOUNTS, DEMO_PASSWORD } from '../../server/demo-accounts.mjs';

let s, H;
before(async () => {
  s = await startServer({ port: 0, quiet: true, testApi: true, accessTtl: 3600 });
  H = { apikey: s.anonKey, 'Content-Type': 'application/json' };
});
after(() => s.close());

const post = (path, body, headers = H) => fetch(s.url + path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
const login = async (email = ACCOUNTS.student.email, password = DEMO_PASSWORD) => {
  const r = await post('/auth/v1/token?grant_type=password', { email, password });
  return { status: r.status, body: await r.json() };
};
const rpc = (fn, args, token) => post(`/rest/v1/rpc/${fn}`, args, token ? { ...H, Authorization: `Bearer ${token}` } : H);
// Raw request, so the path and Host header are sent exactly as written.
const rawGet = (path, host) => new Promise((ok, fail) => {
  const u = new URL(s.url);
  http.get({ host: u.hostname, port: u.port, path, headers: host ? { Host: host } : {} }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => ok({ status: res.statusCode, body: data }));
  }).on('error', fail);
});

test('sign-in returns a Supabase-shaped session; wrong passwords and unknown emails get the same answer', async () => {
  const ok = await login();
  assert.equal(ok.status, 200);
  for (const k of ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'user']) assert.ok(k in ok.body, k);
  assert.equal(ok.body.user.email, ACCOUNTS.student.email);
  const wrong = await login(ACCOUNTS.student.email, 'not-the-password');
  const unknown = await login('nobody@nuvora.test', 'whatever-123');
  assert.equal(wrong.status, 400);
  assert.deepEqual(wrong.body, unknown.body, 'no hint about which emails exist');
  assert.equal(wrong.body.error_code, 'invalid_credentials');
});

test('every API call needs a valid API key', async () => {
  let r = await fetch(`${s.url}/rest/v1/rpc/my_dashboard`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 401);
  const forged = signJwt({ role: 'anon' }, 'some-other-secret');
  r = await post('/rest/v1/rpc/my_dashboard', {}, { ...H, apikey: forged });
  assert.equal(r.status, 401);
  r = await post('/auth/v1/token?grant_type=password', {}, { 'Content-Type': 'application/json' });
  assert.equal(r.status, 401);
});

test('a tampered or expired token is refused', async () => {
  const { body } = await login();
  const [h, p, sig] = body.access_token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  const other = (await login(ACCOUNTS.classmate.email)).body.user.id;
  const tampered = [h, Buffer.from(JSON.stringify({ ...claims, sub: other })).toString('base64url'), sig].join('.');
  let r = await rpc('my_dashboard', {}, tampered);
  assert.equal(r.status, 401);
  const asAdmin = [h, Buffer.from(JSON.stringify({ ...claims, role: 'service_role' })).toString('base64url'), sig].join('.');
  r = await rpc('create_batch', { p_program: 'bs-ds', p_starts_on: '2027-03-01' }, asAdmin);
  assert.equal(r.status, 401);
  const short = await startServer({ port: 0, quiet: true, demo: true, accessTtl: 1 });
  try {
    const t = (await (await fetch(`${short.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { ...H, apikey: short.anonKey },
      body: JSON.stringify({ email: ACCOUNTS.student.email, password: DEMO_PASSWORD }) })).json()).access_token;
    await new Promise((res) => setTimeout(res, 1500));
    r = await fetch(`${short.url}/rest/v1/rpc/my_dashboard`, { method: 'POST', headers: { apikey: short.anonKey, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).message, 'JWT expired');
  } finally { await short.close(); }
});

test('functions run as the caller: anonymous 401, signed-in gets only their own data', async () => {
  let r = await rpc('my_dashboard', {});
  assert.equal(r.status, 401);
  const { body } = await login();
  r = await rpc('my_dashboard', {}, body.access_token);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.profile.email, ACCOUNTS.student.email);
  assert.equal(d.batches.length, 1);
  r = await rpc('create_batch', { p_program: 'bs-ds', p_starts_on: '2027-03-01' }, body.access_token);
  assert.equal(r.status, 403, 'internal functions are closed to students');
  r = await rpc('my_course', { p_batch: s.state.demo.batch.next }, body.access_token);
  assert.equal(r.status, 404, 'another batch is not found');
});

test('injection attempts in function and argument names are rejected before reaching the database', async () => {
  const { body } = await login();
  for (const name of ['my_dashboard;drop table profiles', 'my_dashboard()', '../auth/v1/user', 'MY_DASHBOARD', 'pg_sleep']) {
    const r = await rpc(encodeURIComponent(name), {}, body.access_token);
    assert.ok([404, 403].includes(r.status), `${name} -> ${r.status}`);
  }
  let r = await rpc('my_notifications', { 'p_limit) from pg_user --': 1 }, body.access_token);
  assert.equal(r.status, 400);
  r = await rpc('my_notifications', { p_limit: "1); delete from notifications; --" }, body.access_token);
  assert.equal(r.status, 400, 'values are parameters, never SQL');
  r = await fetch(`${s.url}/rest/v1/rpc/my_notifications`, { method: 'POST', headers: { ...H, Authorization: `Bearer ${body.access_token}` }, body: '[1,2]' });
  assert.equal(r.status, 400);
  r = await fetch(`${s.url}/rest/v1/rpc/my_notifications`, { method: 'POST', headers: { ...H, Authorization: `Bearer ${body.access_token}` }, body: '{bad json' });
  assert.equal(r.status, 400);
  r = await fetch(`${s.url}/rest/v1/rpc/my_notifications`, { method: 'POST', headers: { ...H, Authorization: `Bearer ${body.access_token}` }, body: JSON.stringify({ x: 'a'.repeat(70_000) }) });
  assert.equal(r.status, 413);
  r = await fetch(`${s.url}/rest/v1/profiles`, { headers: { ...H, Authorization: `Bearer ${body.access_token}` } });
  assert.equal(r.status, 404, 'table endpoints are not exposed locally');
});

test('database errors come back with PostgREST status codes and readable messages', async () => {
  const { body } = await login();
  const [p1] = (await (await rpc('my_assignments', { p_batch: s.state.demo.batch.current }, body.access_token)).json()).map((a) => a.id);
  const r = await rpc('submit_assignment', { p_assignment: p1, p_link: 'http://insecure.example' }, body.access_token);
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /https:\/\//);
});

test('refresh tokens rotate and stop working after sign-out', async () => {
  const { body } = await login();
  let r = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: body.refresh_token });
  assert.equal(r.status, 200);
  const next = await r.json();
  r = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: body.refresh_token });
  assert.equal(r.status, 400, 'old refresh token is single-use');
  r = await post('/auth/v1/logout', {}, { ...H, Authorization: `Bearer ${next.access_token}` });
  assert.equal(r.status, 204);
  r = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: next.refresh_token });
  assert.equal(r.status, 400, 'signed out everywhere');
});

test('sign-up creates a student profile and refuses duplicates and weak passwords', async () => {
  let r = await post('/auth/v1/signup', { email: 'New.Person@nuvora.test', password: 'long-enough-1', data: { full_name: 'New Person' } });
  assert.equal(r.status, 200);
  const sess = await r.json();
  const d = await (await rpc('my_dashboard', {}, sess.access_token)).json();
  assert.deepEqual([d.profile.name, d.profile.role, d.batches.length], ['New Person', 'student', 0]);
  r = await post('/auth/v1/signup', { email: 'new.person@nuvora.test', password: 'long-enough-1' });
  assert.equal((await r.json()).error_code, 'user_already_exists');
  r = await post('/auth/v1/signup', { email: 'short@nuvora.test', password: 'short' });
  assert.equal((await r.json()).error_code, 'weak_password');
});

test('password reset: one-time link, same-site redirect only, new password works', async () => {
  const email = ACCOUNTS.nextBatch.email;
  await post(`/auth/v1/recover?redirect_to=${encodeURIComponent('https://evil.example/steal')}`, { email });
  await post('/auth/v1/recover', { email: 'nobody@nuvora.test' });
  const outbox = await (await fetch(`${s.url}/__test/outbox`, { headers: { 'X-Nuvora-Test': '1' } })).json();
  const mail = outbox.filter((m) => m.to === email).at(-1);
  assert.equal(outbox.filter((m) => m.to === 'nobody@nuvora.test').length, 0);
  assert.ok(mail);
  let r = await fetch(mail.link, { redirect: 'manual' });
  assert.equal(r.status, 303);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin, s.url, 'foreign redirect_to was replaced with the portal');
  const p = new URLSearchParams(loc.hash.slice(1));
  assert.equal(p.get('type'), 'recovery');
  r = await fetch(`${s.url}/auth/v1/user`, { method: 'PUT', headers: { ...H, Authorization: `Bearer ${p.get('access_token')}` }, body: JSON.stringify({ password: 'brand-new-pass-1' }) });
  assert.equal(r.status, 200);
  assert.equal((await login(email, 'brand-new-pass-1')).status, 200);
  assert.equal((await login(email, DEMO_PASSWORD)).status, 400);
  r = await fetch(mail.link, { redirect: 'manual' });
  assert.match(r.headers.get('location'), /#error=access_denied/, 'link works only once');
});

test('only local host names are answered, and test routes need their header', async () => {
  assert.equal((await rawGet('/portal/', 'evil.example')).status, 403);
  assert.equal((await rawGet('/portal/', `localhost:${new URL(s.url).port}`)).status, 200);
  let r = await fetch(`${s.url}/__test/outbox`);
  assert.equal(r.status, 403);
  r = await fetch(`${s.url}/rest/v1/rpc/my_dashboard`, { method: 'POST', headers: { ...H, Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r.status, 403, 'cross-origin requests refused');
  const plain = await startServer({ port: 0, quiet: true, demo: false });
  try {
    r = await fetch(`${plain.url}/__test/sql`, { method: 'POST', headers: { 'X-Nuvora-Test': '1', 'Content-Type': 'application/json' }, body: '{"sql":"select 1"}' });
    assert.equal(r.status, 404, 'test API is off unless explicitly enabled');
  } finally { await plain.close(); }
});

test('static files: no path traversal, no dotfiles, no server code', async () => {
  for (const path of ['/portal/..%2f..%2fserver%2fauth.mjs', '/..%2fpackage.json', '/portal/%2e%2e/%2e%2e/package.json',
                      '/portal/..%5c..%5cpackage.json', '/.git/config', '/portal/.env', '/%00']) {
    const r = await rawGet(path);
    assert.ok([400, 404].includes(r.status), `${path} -> ${r.status}`);
    assert.ok(!r.body.includes('createHmac') && !r.body.includes('"devDependencies"'), path);
  }
  const ok = await fetch(`${s.url}/portal/js/app.js`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  const cfg = await (await fetch(`${s.url}/portal/config.js`)).text();
  assert.ok(cfg.includes(s.anonKey) && !cfg.includes(s.serviceKey), 'only the public key is exposed');
});

test('PDF downloads: signed short-lived links, only for students enrolled in that program', async () => {
  const path = 'bs-aiml/lessons/mth-110/notes.pdf';
  const student = (await login()).body.access_token;
  const outsider = (await login(ACCOUNTS.otherProgram.email)).body.access_token;
  const sign = (token, p = path, expiresIn = 60) => fetch(`${s.url}/storage/v1/object/sign/course-files/${p}`, {
    method: 'POST', headers: { ...H, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ expiresIn }) });

  let r = await sign(student);
  assert.equal(r.status, 200);
  const { signedURL } = await r.json();
  r = await fetch(`${s.url}/storage/v1${signedURL}&download=notes.pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /^attachment; filename="notes\.pdf"$/);
  assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

  assert.equal((await sign(outsider)).status, 400, 'another program: refused');
  assert.equal((await sign(null)).status, 400, 'signed out: refused');
  assert.equal((await sign(student, 'bs-aiml/lessons/mth-110/missing.pdf')).status, 400);
  assert.equal((await sign(student, '..%2F..%2Fpackage.json')).status, 400);

  r = await fetch(`${s.url}/storage/v1${signedURL.replace('notes.pdf', 'exercises.pdf')}`);
  assert.equal(r.status, 400, 'a link cannot be reused for another file');
  r = await fetch(`${s.url}/storage/v1${signedURL.slice(0, -4)}AAAA`);
  assert.equal(r.status, 400, 'a tampered link is refused');

  const quick = await (await sign(student, path, 1)).json();
  await new Promise((res) => setTimeout(res, 1500));
  assert.equal((await fetch(`${s.url}/storage/v1${quick.signedURL}`)).status, 400, 'links expire');
});
