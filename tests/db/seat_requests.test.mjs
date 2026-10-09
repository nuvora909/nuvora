// "Request a seat" from the public website: request_seat() is open to visitors, checks every field,
// deduplicates, limits each email to 5 new requests a day, and notifies every admin. Every accepted request,
// new or a repeat, gets the same answer {"ok": true}: no reference and no sign of an earlier request. The
// stored requests are readable only by admins, through their own functions.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, admin1, admin2, inst, student, D;

const TODAY = `(now() at time zone 'America/New_York')::date`;
const ARGS = ['p_program', 'p_start', 'p_full_name', 'p_email', 'p_country', 'p_consent', 'p_consent_version', 'p_phone', 'p_details', 'p_source'];
const base = (over = {}) => ({
  p_program: 'bs-aiml', p_start: D.open, p_full_name: 'Priya Nair', p_email: 'priya@example.com', p_country: 'India',
  p_consent: true, p_consent_version: 'privacy-2026-10', p_phone: null, p_details: {}, p_source: null, ...over,
});
// Calls the function with named arguments, the way the website does through /rest/v1/rpc/request_seat.
const ask = (fn, over) => {
  const a = base(over);
  const names = ARGS.filter((k) => k in a);
  return h.one(fn, `select request_seat(${names.map((k, i) => `${k} => $${i + 1}`).join(', ')})`,
               names.map((k) => (a[k] !== null && typeof a[k] === 'object' ? JSON.stringify(a[k]) : a[k])));
};
const count = (where = 'true', params = []) => h.one(h.sql, `select count(*)::int from seat_requests where ${where}`, params);
const OK = { ok: true };
// The stored requests of an email (newest first), as admins see them.
const stored = async (email, program = null) => (await h.sql(`select *, start_date::text as start from seat_requests
                                                              where email = $1 and ($2::text is null or program_id = $2)
                                                              order by created_at desc, id`, [email, program])).rows;

before(async () => {
  h = await freshDb();
  admin1 = await h.user('admin1@test.io', 'admin');
  admin2 = await h.user('admin2@test.io', 'admin');
  inst = await h.user('instructor@test.io', 'instructor');
  student = await h.user('student@test.io');
  D = (await h.sql(`select next_start_date(${TODAY})::text as open,
                           (next_start_date(${TODAY}) - 7)::text as apply_by,
                           first_monday((next_start_date(${TODAY}) + 35)::date)::text as later,
                           first_monday((next_start_date(${TODAY}) - interval '1 month')::date)::text as closed,
                           first_monday((${TODAY} + 245)::date)::text as far,
                           (next_start_date(${TODAY}) + 1)::text as tuesday,
                           (next_start_date(${TODAY}) + 7)::text as second_monday`)).rows[0];
});

test('visitors can request a seat and get only {"ok": true} back', async () => {
  const r = await ask(h.anon, { p_full_name: '  Priya   Nair ', p_email: ' Priya@Example.COM ', p_phone: '+91 (22) 4000-1234',
                                p_details: { role: 'Analyst', hours: 10, has_bachelor: true, match: null }, p_source: 'programs/bs-ai-machine-learning' });
  assert.deepEqual(r, OK);
  const [saved] = await stored('priya@example.com');
  assert.match(saved.reference, /^NV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, 'admins still get a reference');
  assert.deepEqual([saved.program_id, saved.start], ['bs-aiml', D.open]);
  const row = (await h.sql(`select full_name, email, phone, country, details, source, consent_version, status, notes, handled_by
                            from seat_requests where reference = $1`, [saved.reference])).rows[0];
  assert.deepEqual(row, { full_name: 'Priya Nair', email: 'priya@example.com', phone: '+91 (22) 4000-1234', country: 'India',
                          details: { role: 'Analyst', hours: 10, has_bachelor: true, match: null }, source: 'programs/bs-ai-machine-learning',
                          consent_version: 'privacy-2026-10', status: 'new', notes: null, handled_by: null });
  assert.deepEqual(await ask(h.as(student), { p_email: 'student@test.io', p_program: 'c-py' }), OK);
  assert.equal(await count(`email = 'student@test.io'`), 1, 'signed-in visitors can use the form too');
});

test('every admin is notified once about each new request, nobody else', async () => {
  const id = await h.one(h.sql, `select id from seat_requests where email = 'priya@example.com'`);
  const notes = (await h.sql(`select user_id::text u, title, body from notifications where kind = 'seat_request' and ref_id = $1 order by 1`, [id])).rows;
  assert.deepEqual(notes.map((n) => n.u).sort(), [admin1, admin2].sort());
  assert.equal(notes[0].title, 'New seat request: B.S. Artificial Intelligence & Machine Learning');
  assert.match(notes[0].body, /^Priya Nair \(India\) asked for the .+ start\. Reference NV-[A-Z0-9]{6}\.$/);
  assert.equal(await h.one(h.sql, `select count(*)::int from notifications where kind = 'seat_request' and user_id in ($1, $2)`, [inst, student]), 0);
  assert.equal(await h.one(h.as(admin1), `select count(*)::int from notifications where kind = 'seat_request'`), 2, 'one per request');
});

test('start dates: first Mondays only, open until 7 days before (inclusive), at most 200 days ahead', async () => {
  const problem = (start, today) => h.one(h.sql, `select seat_start_problem($1::date, $2::date)`, [start, today]);
  assert.equal(await problem('2026-11-02', '2026-10-26'), null, 'apply-by day itself is still open');
  assert.match(await problem('2026-11-02', '2026-10-27'), /closed/);
  assert.match(await problem('2026-11-03', '2026-10-01'), /first Monday/);
  assert.match(await problem('2026-11-09', '2026-10-01'), /first Monday/, 'a later Monday is not a start date');
  assert.equal(await problem('2027-04-05', '2026-09-17'), null, 'exactly 200 days ahead');
  assert.match(await problem('2027-04-05', '2026-09-16'), /too far ahead/);
  assert.match(await problem(null, '2026-10-01'), /choose a start date/);

  for (const [start, msg] of [[D.closed, /closed/], [D.far, /too far ahead/], [D.tuesday, /first Monday/], [D.second_monday, /first Monday/], [null, /start date/]]) {
    const e = await rejects(ask(h.anon, { p_email: 'dates@example.com', p_start: start }), msg);
    assert.equal(e.code, '22023');
  }
  assert.deepEqual(await ask(h.anon, { p_email: 'dates@example.com', p_start: D.later }), OK);
  assert.deepEqual((await stored('dates@example.com')).map((r) => r.start), [D.later]);
});

test('the program must exist and take students', async () => {
  await rejects(ask(h.anon, { p_program: 'no-such-program' }), 'Please choose one of our programs');
  await h.sql(`update programs set active = false where id = 'c-mlops'`);
  await rejects(ask(h.anon, { p_program: 'c-mlops', p_email: 'mlops@example.com' }), 'Please choose one of our programs');
  await h.sql(`update programs set active = true where id = 'c-mlops'`);
});

test('names, emails, countries and phone numbers are checked', async () => {
  const bad = [
    [{ p_full_name: 'A' }, 'full name'], [{ p_full_name: 'x'.repeat(81) }, 'full name'], [{ p_full_name: 'Ann\nLee' }, 'full name'],
    [{ p_full_name: 'Ann\u0007Lee' }, 'full name'], [{ p_full_name: null }, 'full name'],
    [{ p_email: 'not-an-email' }, 'valid email'], [{ p_email: 'a@b' }, 'valid email'], [{ p_email: 'a@@b.com' }, 'valid email'],
    [{ p_email: 'a b@c.com' }, 'valid email'], [{ p_email: '.a@b.com' }, 'valid email'], [{ p_email: 'a..b@c.com' }, 'valid email'],
    [{ p_email: `${'a'.repeat(65)}@b.com` }, 'valid email'], [{ p_email: `a@${'b'.repeat(250)}.com` }, 'valid email'], [{ p_email: '' }, 'valid email'],
    [{ p_email: 'x@example.com<script>' }, 'valid email'],
    [{ p_country: 'X' }, 'country'], [{ p_country: 'x'.repeat(57) }, 'country'], [{ p_country: '' }, 'country'], [{ p_country: 'In\u0001dia' }, 'country'],
    [{ p_phone: '12345' }, 'phone'], [{ p_phone: '1'.repeat(25) }, 'phone'], [{ p_phone: '+1 555 abc 1234' }, 'phone'], [{ p_phone: '555-1234<b>' }, 'phone'],
  ];
  for (const [over, msg] of bad) {
    const e = await rejects(ask(h.anon, { p_email: 'checks@example.com', ...over }), msg);
    assert.equal(e.code, '22023', JSON.stringify(over));
  }
  assert.equal(await count(`email like 'checks@%'`), 0);
  assert.deepEqual(await ask(h.anon, { p_email: 'Checks@Example.com', p_full_name: 'José  María', p_phone: '   ', p_country: 'Côte d’Ivoire' }), OK);
  assert.deepEqual((await h.sql(`select email, full_name, phone from seat_requests where email like 'checks@%'`)).rows,
                   [{ email: 'checks@example.com', full_name: 'José María', phone: null }]);
});

test('consent to be contacted is required, with the version of its wording', async () => {
  for (const over of [{ p_consent: false }, { p_consent: null }]) await rejects(ask(h.anon, { p_email: 'consent@example.com', ...over }), 'agree to be contacted');
  for (const over of [{ p_consent_version: '' }, { p_consent_version: '   ' }, { p_consent_version: null }, { p_consent_version: 'v'.repeat(41) }]) {
    await rejects(ask(h.anon, { p_email: 'consent@example.com', ...over }), 'reload the page');
  }
  assert.equal(await count(`email = 'consent@example.com'`), 0);
});

test('answers: known keys only, each a short scalar, 1000 characters in all; source up to 200', async () => {
  const bad = [{ evil: 'x' }, { role: { nested: true } }, { role: ['a'] }, { goal: 'x'.repeat(201) },
               { role: 'x'.repeat(190), goal: 'x'.repeat(190), hours: 'x'.repeat(190), coding: 'x'.repeat(190), match: 'x'.repeat(190), score: 'x'.repeat(190) }];
  for (const d of bad) await rejects(ask(h.anon, { p_email: 'details@example.com', p_details: d }), 'could not be saved');
  await rejects(h.anon(`select request_seat(p_program => 'bs-aiml', p_start => $1, p_full_name => 'Ann Lee', p_email => 'details@example.com',
                        p_country => 'India', p_consent => true, p_consent_version => 'v1', p_details => '[1, 2]'::jsonb)`, [D.open]), 'could not be saved');
  await rejects(ask(h.anon, { p_email: 'details@example.com', p_source: 's'.repeat(201) }), 'reload the page');
  assert.equal(await count(`email = 'details@example.com'`), 0);
  assert.deepEqual(await ask(h.anon, { p_email: 'details@example.com', p_details: null, p_source: '   ' }), OK);
  assert.deepEqual((await h.sql(`select details, source from seat_requests where email = 'details@example.com'`)).rows, [{ details: {}, source: null }]);
});

test('a repeat (same email, program and start within 30 days) gets the same answer, stores nothing and reveals nothing', async () => {
  assert.deepEqual(await ask(h.anon, { p_email: 'twice@example.com' }), OK);
  const [first] = await stored('twice@example.com');
  const notes = await h.one(h.sql, `select count(*)::int from notifications`);
  const again = await ask(h.anon, { p_email: 'TWICE@example.com', p_full_name: 'Someone Else', p_phone: '+44 20 7946 0000' });
  assert.deepEqual(again, OK, 'no reference and no "duplicate" flag');
  assert.equal(await count(`email = 'twice@example.com'`), 1);
  assert.equal(await h.one(h.sql, `select count(*)::int from notifications`), notes, 'admins are not notified twice');
  assert.deepEqual(await ask(h.anon, { p_email: 'twice@example.com', p_start: D.later }), OK);
  assert.deepEqual(await ask(h.anon, { p_email: 'twice@example.com', p_program: 'ms-aml' }), OK);
  assert.equal(await count(`email = 'twice@example.com'`), 3, 'another start or another program is a new request');
  await h.sql(`update seat_requests set created_at = now() - interval '31 days' where reference = $1`, [first.reference]);
  assert.deepEqual(await ask(h.anon, { p_email: 'twice@example.com' }), OK);
  const later = await stored('twice@example.com', 'bs-aiml');
  assert.equal(later.filter((r) => r.start === D.open).length, 2, 'after 30 days it counts as new');
  assert.notEqual(later[0].reference, first.reference);
});

test('at most 5 new requests per email in 24 hours; over the limit the answer is the same and nothing is stored', async () => {
  const email = 'busy@example.com';
  for (const p of ['bs-ds', 'bs-aiml', 'ms-aml', 'ms-ds', 'c-py']) assert.deepEqual(await ask(h.anon, { p_email: email, p_program: p }), OK);
  assert.equal(await count(`email = $1`, [email]), 5);
  const notes = await h.one(h.sql, `select count(*)::int from notifications`);
  assert.deepEqual(await ask(h.anon, { p_email: email, p_program: 'c-genai' }), OK, 'an error would reveal the earlier requests');
  assert.equal(await count(`email = $1 and program_id = 'c-genai'`, [email]), 0, 'the sixth is not stored');
  assert.equal(await h.one(h.sql, `select count(*)::int from notifications`), notes, 'nor announced');
  assert.deepEqual(await ask(h.anon, { p_email: email, p_program: 'bs-ds' }), OK, 'a repeat answers the same');
  assert.deepEqual(await ask(h.anon, { p_email: 'other@example.com', p_program: 'c-genai' }), OK);
  assert.equal(await count(`email = 'other@example.com'`), 1, 'other emails are unaffected');
  await h.sql(`update seat_requests set created_at = now() - interval '25 hours' where email = $1 and program_id = 'bs-ds'`, [email]);
  assert.deepEqual(await ask(h.anon, { p_email: email, p_program: 'c-genai' }), OK);
  assert.equal(await count(`email = $1`, [email]), 6, 'older requests no longer count');
});

test('nobody reads or changes seat requests directly; admins work them through their functions', async () => {
  for (const who of [h.anon, h.as(student), h.as(inst), h.as(admin1)]) {
    await rejects(who(`select * from seat_requests`), '42501');
    await rejects(who(`insert into seat_requests (reference, program_id, start_date, full_name, email, country, consent_version)
                       values ('NV-AAAAAA', 'bs-ds', $1, 'Eve Evil', 'eve@example.com', 'Nowhere', 'v1')`, [D.open]), '42501');
    await rejects(who(`update seat_requests set status = 'closed'`), '42501');
  }
  await rejects(h.anon(`select admin_seat_requests()`), '42501');
  for (const who of [student, inst]) {
    await rejects(h.as(who)(`select admin_seat_requests()`), 'Admins only');
    await rejects(h.as(who)(`select admin_update_seat_request(gen_random_uuid(), 'closed')`), 'Admins only');
  }

  const all = await h.one(h.as(admin1), `select admin_seat_requests()`);
  assert.equal(all.length, await count());
  assert.ok(all.every((r, i) => i === 0 || r.created_at <= all[i - 1].created_at), 'newest first');
  const priya = all.find((r) => r.email === 'priya@example.com');
  assert.equal(priya.apply_by, D.apply_by);
  assert.equal(priya.program_name, 'B.S. Artificial Intelligence & Machine Learning');

  const updated = await h.one(h.as(admin2), `select admin_update_seat_request($1, 'contacted', 'Called; sending the application link.')`, [priya.id]);
  assert.deepEqual([updated.status, updated.notes, updated.handled_by], ['contacted', 'Called; sending the application link.', 'admin2']);
  const kept = await h.one(h.as(admin1), `select admin_update_seat_request($1, 'converted')`, [priya.id]);
  assert.deepEqual([kept.status, kept.notes, kept.handled_by], ['converted', 'Called; sending the application link.', 'admin1'], 'null keeps the notes');
  assert.deepEqual((await h.one(h.as(admin1), `select admin_seat_requests('converted')`)).map((r) => r.id), [priya.id]);
  await rejects(h.as(admin1)(`select admin_seat_requests('lost')`), 'Invalid status');
  await rejects(h.as(admin1)(`select admin_update_seat_request($1, 'won')`, [priya.id]), 'Invalid status');
  await rejects(h.as(admin1)(`select admin_update_seat_request($1, 'closed', $2)`, [priya.id, 'n'.repeat(2001)]), '2000 characters');
  await rejects(h.as(admin1)(`select admin_update_seat_request(gen_random_uuid(), 'closed')`), 'Unknown seat request');
});
