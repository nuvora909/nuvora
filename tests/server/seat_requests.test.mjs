// The website's "Request a seat" form calls POST /rest/v1/rpc/request_seat with only the public (anon) key.
// It must work exactly like that, and the stored requests must not be readable through any route.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/dev-server.mjs';
import { ACCOUNTS, DEMO_PASSWORD } from '../../server/demo-accounts.mjs';

let s, H, start;
before(async () => {
  s = await startServer({ port: 0, quiet: true, testApi: true });
  H = { apikey: s.anonKey, 'Content-Type': 'application/json' };
  // Today in India decides which starts are open (not the server's UTC date).
  start = (await (await fetch(`${s.url}/__test/sql`, { method: 'POST', headers: { 'X-Nuvora-Test': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: `select next_start_date((now() at time zone 'Asia/Kolkata')::date)::text as d` }) })).json())[0].d;
});
after(() => s.close());

const post = (path, body, headers = H) => fetch(s.url + path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
const token = async (who) => (await (await post('/auth/v1/token?grant_type=password', { email: ACCOUNTS[who].email, password: DEMO_PASSWORD })).json()).access_token;
const form = (over = {}) => ({
  p_program: 'ms-ds', p_start: start, p_full_name: 'Ravi Kumar', p_email: 'ravi.kumar@example.com', p_country: 'India',
  p_consent: true, p_consent_version: 'privacy-2026-10', p_phone: '+91 98765 43210',
  p_details: { role: 'Data analyst', hours: '10-14', has_bachelor: true, score: 82 }, p_source: '/programs/ms-data-science-analytics/', ...over,
});

test('the form works with the public key alone and answers only {"ok": true}, new or repeated', async () => {
  let r = await post('/rest/v1/rpc/request_seat', form());
  assert.equal(r.status, 200);
  const first = await r.text();
  assert.equal(first, '{"ok":true}');
  r = await post('/rest/v1/rpc/request_seat', form({ p_email: 'RAVI.KUMAR@example.com', p_phone: undefined, p_details: undefined, p_source: undefined }));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), first, 'optional fields may be left out; a repeat gets exactly the same answer');
  r = await fetch(`${s.url}/rest/v1/rpc/request_seat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form()) });
  assert.equal(r.status, 401, 'an API key is still required');
});

test('a refused request comes back as 400 with a message the website can show', async () => {
  for (const [over, msg] of [[{ p_email: 'nope' }, /valid email/], [{ p_consent: false }, /agree to be contacted/],
                             [{ p_program: 'xx' }, /choose one of our programs/], [{ p_details: { password: 'x' } }, /could not be saved/]]) {
    const r = await post('/rest/v1/rpc/request_seat', form(over));
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.code, '22023');
    assert.match(body.message, msg);
  }
});

test('seat requests cannot be read through any route by visitors, students or instructors', async () => {
  for (const path of ['/rest/v1/seat_requests', '/rest/v1/seat_requests?select=*', '/rest/v1/rpc/seat_requests']) {
    const r = await fetch(s.url + path, { headers: H });
    assert.equal(r.status, 404, `GET ${path}`);
  }
  for (const fn of ['admin_seat_requests', 'seat_request_json', 'seat_request_notify', 'seat_reference', 'seat_start_problem']) {
    const r = await post(`/rest/v1/rpc/${fn}`, {});
    assert.ok([401, 404].includes(r.status), `${fn} as a visitor -> ${r.status}`);
    assert.doesNotMatch(await r.text(), /ravi/i);
  }
  for (const who of ['student', 'instructor']) {
    const r = await post('/rest/v1/rpc/admin_seat_requests', {}, { ...H, Authorization: `Bearer ${await token(who)}` });
    assert.equal(r.status, 403, who);
    assert.doesNotMatch(await r.text(), /ravi/i);
  }
  const r = await fetch(`${s.url}/__test/sql`, { method: 'POST', headers: H, body: JSON.stringify({ sql: 'select * from seat_requests' }) });
  assert.equal(r.status, 403, 'the test route needs its header');
  const signed = await post('/storage/v1/object/sign/course-files/seat_requests', { expiresIn: 60 });
  assert.equal(signed.status, 400);
});

test('admins see the request and are notified of it', async () => {
  const admin = { ...H, Authorization: `Bearer ${await token('admin')}` };
  const list = await (await post('/rest/v1/rpc/admin_seat_requests', { p_status: 'new' }, admin)).json();
  const mine = list.filter((x) => x.email === 'ravi.kumar@example.com');
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].details, { role: 'Data analyst', hours: '10-14', has_bachelor: true, score: 82 });
  const notes = await (await post('/rest/v1/rpc/my_notifications', {}, admin)).json();
  assert.match(mine[0].reference, /^NV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, 'the reference is for admins only');
  assert.ok(notes.items.some((n) => n.kind === 'seat_request' && n.body.includes(mine[0].reference)));
  const upd = await post('/rest/v1/rpc/admin_update_seat_request', { p_id: mine[0].id, p_status: 'contacted', p_notes: 'Emailed the brochure.' }, admin);
  assert.equal(upd.status, 200);
  assert.equal((await upd.json()).status, 'contacted');
});
