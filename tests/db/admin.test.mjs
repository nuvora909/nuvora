// The admin area's functions (docs/admin-api.md): every one checks the admin role itself, every change is
// written to the audit log, and the answers have the documented shape. Times are relative to now().
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, admin, admin2, inst, inst2, S = {}, B, F, ask;

const PAST_MONDAY = `(current_date - 70 - (extract(isodow from current_date - 70)::int - 1))`;
const TODAY = `(now() at time zone 'America/New_York')::date`;
const enroll = async (key, email, name, batchStart = PAST_MONDAY, program = 'ms-ds') => {
  const id = await h.user(email, 'student', name);
  const eid = await h.one(h.service, `select enroll_student($1, $2, ${batchStart})`, [id, program]);
  S[key] = { id, eid, email, name };
};
const joined = (key, ago) => h.sql(`update enrollments set enrolled_at = now() - $2::interval where id = $1`, [S[key].eid, ago]);
const auditCount = () => h.one(h.sql, `select count(*)::int from admin_audit`);
const lastAudit = async () => (await h.sql(`select a.*, (select email from profiles where id = a.person_id) as person_email
                                            from admin_audit a order by created_at desc, id desc limit 1`)).rows[0];

before(async () => {
  h = await freshDb();
  admin = await h.user('ada@nuvora.test', 'admin', 'Ada Admin');
  admin2 = await h.user('bo@nuvora.test', 'admin', 'Bo Admin');
  inst = await h.user('elena@nuvora.test', 'instructor', 'Elena Ruiz');
  inst2 = await h.user('kofi@nuvora.test', 'instructor', 'Kofi Mensah');
  ask = h.as(admin);
  B = await h.one(h.service, `select create_batch('ms-ds', ${PAST_MONDAY}, 1)`);
  F = await h.one(h.service, `select create_batch('bs-aiml', first_monday((current_date + interval '1 month')::date), 1)`);
  await h.service(`select update_batch_statuses(current_date)`);
  await enroll('maya', 'maya@example.com', 'Maya Patel');
  await enroll('ines', 'ines@example.com', 'Ines Duarte');
  await enroll('kenji', 'kenji@example.com', 'Kenji Sato');
  await enroll('lucas', 'lucas@example.com', 'Lucas Moreau');
  await enroll('amara', 'amara@example.com', 'Amara Okafor');
  await enroll('pat', 'pat@example.com', 'Pat Paused');
  await enroll('wei', 'wei@example.com', 'Wei Chen', `first_monday((current_date + interval '1 month')::date)`, 'bs-aiml');
  S.nia = { id: await h.user('nia@example.com', 'student', 'Nia Brooks'), email: 'nia@example.com' };
  await joined('ines', '24 days');
  await joined('kenji', '40 days');
  await joined('amara', '45 days');
  await ask(`select admin_record_payment($1, 2450, 'bank_transfer', 'HDFC-1')`, [S.maya.eid]);
  await ask(`select admin_set_access($1, 'off', 'Asked to pause for a month')`, [S.lucas.eid]);
  await ask(`select admin_set_access($1, 'on', 'Paying in two weeks', now() + interval '14 days')`, [S.amara.eid]);
  await ask(`select admin_set_enrollment_status($1, 'paused')`, [S.pat.eid]);
  await ask(`select admin_assign_staff($1, $2)`, [B, inst]);
  await h.service(`select apply_access_rules()`);
  const start = await h.one(h.sql, `select next_start_date(${TODAY})::text`);
  for (const [email, program] of [['nia@example.com', 'c-py'], ['someone@example.com', 'ms-aml'], ['maya@example.com', 'ms-aml']]) {
    await h.anon(`select request_seat(p_program => $1, p_start => $2::date, p_full_name => 'Test Person', p_email => $3, p_country => 'India',
                                      p_consent => true, p_consent_version => 'v1')`, [program, start, email]);
  }
});

test('every admin function refuses everyone but admins, before doing anything', async () => {
  const fns = (await h.sql(`select p.proname as f, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
                            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'public' and p.proname like 'admin\\_%'
                              and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`)).rows;
  assert.ok(fns.length >= 24, `${fns.length} admin functions`);
  const before = await auditCount();
  for (const { f, types } of fns) {
    const call = `select public.${f}(${types.map((t) => `null::${t}`).join(', ')})`;
    for (const who of [S.maya.id, inst]) await rejects(h.as(who)(call), 'Admins only');
    await rejects(h.anon(call), '42501');
  }
  assert.equal(await auditCount(), before, 'refused calls write nothing');
});

test('overview: counts by access state, the students in their 30 days, and the stopped ones', async () => {
  const o = await h.one(ask, `select admin_overview()`);
  const { grace, stopped, ...counts } = o;
  assert.deepEqual(counts, { students: 8, enrolled: 6, active_enrollments: 6, paid: 1, in_grace: 2, ending_soon: 1, stopped_unpaid: 1,
                             stopped_manual: 1, started_manual: 1, reserved: 0, paused: 1, new_seat_requests: 3, batches_running: 2 });
  assert.deepEqual(grace.map((g) => [g.name, g.days_left]), [['Ines Duarte', 6], ['Wei Chen', grace[1].days_left]]);
  assert.ok(grace[1].days_left > 30, 'a term that has not started yet');
  assert.deepEqual(Object.keys(grace[0]).sort(), ['batch_code', 'batch_id', 'days_left', 'email', 'ends_at', 'enrollment_id', 'name', 'program',
                                                  'program_id', 'since', 'state', 'student_id', 'term']);
  assert.deepEqual(stopped.map((g) => [g.name, g.state, g.since !== null]), [['Kenji Sato', 'stopped_unpaid', true], ['Lucas Moreau', 'stopped_manual', true]]);
});

test('students database: search, filters, sorting and paging', async () => {
  const q = async (args = {}) => {
    const names = Object.keys(args);
    return h.one(ask, `select admin_students(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`, names.map((n) => args[n]));
  };
  const all = await q();
  assert.equal(all.total, 8);
  assert.deepEqual(all.rows.map((r) => r.name), ['Amara Okafor', 'Ines Duarte', 'Kenji Sato', 'Lucas Moreau', 'Maya Patel', 'Nia Brooks', 'Pat Paused', 'Wei Chen']);
  const ines = all.rows[1];
  assert.deepEqual([ines.enrollment_status, ines.program_id, ines.term, ines.terms, ines.payment, ines.access.state, ines.access.days_left],
                   ['active', 'ms-ds', 1, 4, 'unpaid', 'grace', 6]);
  assert.deepEqual(Object.keys(ines).sort(), ['access', 'batch_code', 'batch_id', 'email', 'enrolled_at', 'enrollment_id', 'enrollment_status',
    'ends_on', 'last_active_at', 'name', 'payment', 'program', 'program_id', 'role', 'signed_up_at', 'starts_on', 'student_id', 'term', 'term_title', 'terms'].sort());
  const nia = all.rows[5];
  assert.deepEqual([nia.enrollment_id, nia.payment, nia.access], [null, null, null]);

  const names = (r) => r.rows.map((x) => x.name);
  assert.deepEqual(names(await q({ p_search: 'KEN' })), ['Kenji Sato']);
  assert.deepEqual(names(await q({ p_search: 'lucas@exa' })), ['Lucas Moreau']);
  assert.deepEqual(names(await q({ p_search: '%' })), [], 'wildcards are taken literally');
  assert.deepEqual(names(await q({ p_program: 'bs-aiml' })), ['Wei Chen']);
  assert.equal((await q({ p_batch: B })).total, 6);
  assert.deepEqual(names(await q({ p_status: 'none' })), ['Nia Brooks']);
  assert.deepEqual(names(await q({ p_status: 'paused' })), ['Pat Paused']);
  assert.deepEqual(names(await q({ p_payment: 'paid' })), ['Maya Patel']);
  assert.deepEqual(names(await q({ p_access: 'grace' })), ['Ines Duarte', 'Wei Chen']);
  assert.deepEqual(names(await q({ p_access: 'stopped' })), ['Kenji Sato', 'Lucas Moreau']);
  assert.deepEqual(names(await q({ p_access: 'open' })), ['Amara Okafor', 'Ines Duarte', 'Maya Patel', 'Wei Chen']);
  assert.deepEqual(names(await q({ p_access: 'closed' })), ['Pat Paused']);
  const soon = await q({ p_access: 'ending_soon', p_sort: 'days_left' });
  assert.deepEqual(names(soon), ['Ines Duarte'], 'pausing within 7 days: not every open student');
  assert.equal(soon.total, (await h.one(ask, `select admin_overview()`)).ending_soon, 'the same students the overview tile counts');
  assert.deepEqual(names(await q({ p_sort: 'days_left' })).slice(0, 3), ['Ines Duarte', 'Amara Okafor', 'Wei Chen'], 'soonest first, empty values last');
  assert.deepEqual(names(await q({ p_sort: 'name', p_desc: true })).slice(0, 2), ['Wei Chen', 'Pat Paused']);
  const page = await q({ p_limit: 3, p_offset: 3 });
  assert.deepEqual([page.total, page.limit, page.offset, names(page)], [8, 3, 3, ['Lucas Moreau', 'Maya Patel', 'Nia Brooks']]);
  for (const [args, msg] of [[{ p_sort: 'salary' }, 'Invalid sort'], [{ p_status: 'lost' }, 'Invalid status'], [{ p_payment: 'some' }, 'Invalid payment'],
                             [{ p_access: 'maybe' }, 'Invalid access'], [{ p_limit: 0 }, 'Limit'], [{ p_limit: 201 }, 'Limit'], [{ p_offset: -1 }, 'Offset'],
                             [{ p_search: 'x'.repeat(101) }, 'at most 100']]) {
    assert.equal((await rejects(q(args), msg)).code, '22023');
  }
});

test('one student: profile, enrollments with access and payments, access history, audit entries, seat requests', async () => {
  const d = await h.one(ask, `select admin_student($1)`, [S.maya.id]);
  assert.deepEqual([d.profile.name, d.profile.email, d.profile.role], ['Maya Patel', 'maya@example.com', 'student']);
  assert.equal(d.enrollments.length, 1);
  const e = d.enrollments[0];
  assert.deepEqual([e.status, e.batch.term, e.access.state, e.payments.length, e.payments[0].reference, e.payments[0].recorded_by],
                   ['active', 1, 'paid', 1, 'HDFC-1', 'Ada Admin']);
  assert.deepEqual(d.audit.map((a) => a.action), ['payment.record']);
  assert.deepEqual(d.seat_requests.map((r) => r.program), ['ms-aml'], 'requests made with the same email');
  const k = await h.one(ask, `select admin_student($1)`, [S.kenji.id]);
  assert.deepEqual(k.access_history.map((x) => [x.kind, x.state, x.actor]), [['stopped', 'stopped_unpaid', null]], 'stopped by the hourly job');
  const l = await h.one(ask, `select admin_student($1)`, [S.lucas.id]);
  assert.deepEqual(l.access_history.map((x) => [x.kind, x.reason, x.actor]).sort(),
                   [['mode_off', 'Asked to pause for a month', 'Ada Admin'], ['stopped', null, 'Ada Admin']]);
  assert.equal((await rejects(ask(`select admin_student(gen_random_uuid())`), 'Unknown student')).code, 'P0002');
});

test('payments: amounts, methods, dates and references are checked; voiding keeps the record', async () => {
  const rec = (amount, method, ref = null, note = null, paidOn = null) =>
    h.one(ask, `select admin_record_payment($1, $2, $3, $4, $5, $6::date)`, [S.ines.eid, amount, method, ref, note, paidOn]);
  for (const [args, msg] of [[[0, 'cash'], 'amount'], [[-5, 'cash'], 'amount'], [[10.555, 'cash'], 'amount'], [[100001, 'cash'], 'amount'],
                             [[10, 'card'], 'payment method'], [[10, null], 'payment method']]) {
    assert.equal((await rejects(rec(...args), msg)).code, '22023');
  }
  await rejects(rec(10, 'cash', null, null, '2999-01-01'), 'cannot be in the future');
  assert.equal((await rejects(rec(10, 'cash', 'r'.repeat(101)), '100 characters')).code, '22001');
  assert.equal((await rejects(rec(10, 'cash', null, 'n'.repeat(1001)), '1000 characters')).code, '22001');
  await rejects(rec(10, 'cash', 'HDFC-1'), 'already recorded');
  assert.equal((await rejects(rec(10, 'cash', 'hdfc-1'), 'already recorded')).code, '23505', 'references are unique ignoring case');
  await rejects(ask(`select admin_record_payment(gen_random_uuid(), 10, 'cash')`), 'Unknown enrollment');

  const r = await rec(1200.5, 'bank_transfer', '  UTR-555  ', 'First half', '2026-09-20');
  assert.deepEqual({ ...r.payment, id: 'x', recorded_at: 'x' }, { id: 'x', enrollment_id: S.ines.eid, amount_usd: 1200.5, method: 'bank_transfer',
    reference: 'UTR-555', note: 'First half', paid_on: '2026-09-20', source: 'admin', recorded_by: 'Ada Admin', recorded_at: 'x',
    voided: false, voided_at: null, voided_by: null, void_reason: null });
  assert.deepEqual([r.access.state, r.access.paid_usd, r.access.tuition_usd], ['paid', 1200.5, 2450]);
  await rejects(ask(`select admin_void_payment($1, '  ')`, [r.payment.id]), 'Give a reason');
  const v = await h.one(h.as(admin2), `select admin_void_payment($1, 'Wrong student')`, [r.payment.id]);
  assert.deepEqual([v.payment.voided, v.payment.voided_by, v.payment.void_reason, v.access.state], [true, 'Bo Admin', 'Wrong student', 'grace']);
  await rejects(ask(`select admin_void_payment($1, 'again')`, [r.payment.id]), 'already voided');
  await rejects(ask(`select admin_void_payment(gen_random_uuid(), 'x')`), 'Unknown payment');
  const again = await rec(1200.5, 'bank_transfer', 'UTR-555');
  assert.equal(again.payment.reference, 'UTR-555', 'a voided reference can be recorded again');
  await h.one(ask, `select admin_void_payment($1, 'Test cleanup')`, [again.payment.id]);
  assert.equal((await rec(0, 'waiver', null, 'Scholarship')).payment.amount_usd, 0, 'a waiver may be 0');
  const w = await h.one(ask, `select admin_student($1)`, [S.ines.id]);
  assert.deepEqual(w.enrollments[0].payments.map((p) => p.voided), [false, true, true], 'newest first, voided ones included');
  await rejects(ask(`delete from payments`), '42501');
});

test('batches: list with seats and instructors; update capacity, status and the live-class link', async () => {
  const list = await h.one(ask, `select admin_batches()`);
  assert.deepEqual(list.map((b) => b.id), [F, B], 'scheduled and active, newest start first');
  const b = list[1];
  assert.deepEqual([b.capacity, b.enrolled, b.seats_taken, b.seats_left, b.instructors.map((i) => i.name)],
                   [60, { active: 5, reserved: 0, paused: 1, completed: 0, withdrawn: 0 }, 5, 55, ['Elena Ruiz']]);
  assert.deepEqual(Object.keys(b.sessions), ['total', 'upcoming', 'upcoming_with_link']);
  assert.equal((await h.one(ask, `select admin_batches('all', 'bs-aiml')`)).length, 1);
  await rejects(ask(`select admin_batches('running')`), 'Invalid status');

  const upd = (args) => h.one(ask, `select admin_update_batch($1, $2, $3, $4)`, [B, args.capacity ?? null, args.status ?? null, args.url ?? null]);
  await rejects(upd({ capacity: 4 }), '5 students already hold seats');
  await rejects(upd({ capacity: 501 }), 'between 1 and 500');
  await rejects(upd({ status: 'running' }), 'Invalid status');
  for (const url of ['http://Jitsi.us/j/1', 'https://Jitsi.us/j/1 2', 'Jitsi.us/j/1', `https://${'a'.repeat(500)}`]) await rejects(upd({ url }), 'Join links');
  await rejects(ask(`select admin_update_batch(gen_random_uuid(), 10)`), 'Unknown batch');

  // A class starting in 5 minutes: students get the link only inside the window, by the server's clock.
  const live = await h.one(h.sql, `select id from sessions where batch_id = $1 and starts_at > now() order by starts_at limit 1`, [B]);
  await h.sql(`update sessions set starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes' where id = $1`, [live]);
  const u = await upd({ capacity: 40, url: ' https://Jitsi.us/j/123456789?pwd=abc ' });
  assert.deepEqual([u.capacity, u.seats_left, u.sessions.upcoming_with_link === u.sessions.upcoming, u.next_session.join_url],
                   [40, 35, true, 'https://Jitsi.us/j/123456789?pwd=abc']);
  const mine = await h.one(h.as(S.maya.id), `select my_sessions($1)`, [B]);
  assert.deepEqual(mine.filter((s) => s.join_url).map((s) => [s.id, s.join_url]), [[live, 'https://Jitsi.us/j/123456789?pwd=abc']]);
  // Every class has its own Jitsi room link from the start (migration 20261009065400); a new link replaces it only
  // on classes still to come.
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions where batch_id = $1 and ends_at < now()
                                    and join_url = 'https://Jitsi.us/j/123456789?pwd=abc'`, [B]), 0, 'past classes are not changed');
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions where batch_id = $1 and ends_at < now()
                                    and join_url is distinct from 'https://meet.jit.si/nuvora-' || room_id::text`, [B]), 0,
               'past classes keep their own room link');
  const a = await lastAudit();
  assert.deepEqual([a.action, a.target_id, a.details.capacity, a.details.join_link.removed], ['batch.update', B, { from: 60, to: 40 }, false]);
  const cleared = await upd({ url: '' });
  assert.equal(cleared.sessions.upcoming_with_link, 0, 'an empty link removes them');
  assert.equal((await upd({ status: 'cancelled' })).status, 'cancelled');
  assert.equal((await upd({ status: 'active' })).status, 'active');
});

test('staff: list, roles by email, assigning and unassigning', async () => {
  const staff = await h.one(ask, `select admin_staff()`);
  assert.deepEqual(staff.map((p) => [p.name, p.role]), [['Ada Admin', 'admin'], ['Bo Admin', 'admin'], ['Elena Ruiz', 'instructor'], ['Kofi Mensah', 'instructor']]);
  assert.deepEqual(staff[2].batches.map((x) => x.id), [B]);
  await rejects(ask(`select admin_set_role_by_email('nobody@example.com', 'instructor')`), 'No account with email');
  await rejects(ask(`select admin_set_role_by_email('nia@example.com', 'owner')`), 'Invalid role');
  await rejects(ask(`select admin_assign_staff($1, $2)`, [B, S.nia.id]), 'Make this person an instructor first');
  const r = await h.one(ask, `select admin_set_role_by_email(' NIA@example.com ', 'instructor')`);
  assert.deepEqual(r, { id: S.nia.id, email: 'nia@example.com', name: 'Nia Brooks', role: 'instructor' });
  await ask(`select admin_assign_staff($1, $2, 'mentor')`, [B, S.nia.id]);
  await rejects(ask(`select admin_assign_staff($1, $2, 'dean')`, [B, S.nia.id]), 'Invalid staff role');
  await ask(`select admin_assign_staff($1, $2)`, [F, inst2]);
  await ask(`select admin_unassign_staff($1, $2)`, [F, inst2]);
  await rejects(ask(`select admin_unassign_staff($1, $2)`, [F, inst2]), 'does not teach that batch');
  const back = await h.one(ask, `select admin_set_role_by_email('nia@example.com', 'student')`);
  assert.equal(back.role, 'student');
  assert.equal(await h.one(h.sql, `select count(*)::int from batch_staff where user_id = $1`, [S.nia.id]), 0, 'a student teaches nothing');
  assert.deepEqual((await lastAudit()).details.removed_from_batches, [(await h.one(h.sql, `select code from batches where id = $1`, [B]))]);
  await h.one(ask, `select admin_set_role_by_email('bo@nuvora.test', 'instructor')`);
  await rejects(ask(`select admin_set_role_by_email('ada@nuvora.test', 'student')`), 'At least one admin must remain');
  await h.one(h.as(admin), `select admin_set_role_by_email('bo@nuvora.test', 'admin')`);
});

test('seat requests: list, update and convert into an enrollment once the person has an account', async () => {
  const list = await h.one(ask, `select admin_seat_requests('new')`);
  const req = list.find((r) => r.email === 'someone@example.com');
  assert.deepEqual([req.account_id, req.program, req.status], [null, 'ms-aml', 'new']);
  assert.match(req.reference, /^NV-/);
  await rejects(ask(`select admin_convert_seat_request($1)`, [req.id]), 'No account with email someone@example.com yet');
  const someone = await h.user('Someone@Example.com', 'student', 'Some One');
  const c = await h.one(ask, `select admin_convert_seat_request($1)`, [req.id]);
  assert.deepEqual([c.request.status, c.request.account_id, c.request.handled_by], ['converted', someone, 'Ada Admin']);
  const e = (await h.sql(`select e.status, b.program_id, b.term_no, b.starts_on::text as s from enrollments e join batches b on b.id = e.batch_id
                          where e.id = $1`, [c.enrollment_id])).rows[0];
  assert.deepEqual(e, { status: 'active', program_id: 'ms-aml', term_no: 1, s: req.start_date });
  await rejects(ask(`select admin_convert_seat_request($1)`, [req.id]), 'already converted');
  await rejects(ask(`select admin_convert_seat_request(gen_random_uuid())`), 'Unknown seat request');
  const n = list.find((r) => r.email === 'nia@example.com');
  const u = await h.one(ask, `select admin_update_seat_request($1, 'contacted', 'Called, will apply next month')`, [n.id]);
  assert.deepEqual([u.status, u.notes, u.account_id], ['contacted', 'Called, will apply next month', S.nia.id]);
  const a = await lastAudit();
  assert.deepEqual([a.action, a.person_id, a.details.from, a.details.to], ['seat_request.update', S.nia.id, 'new', 'contacted']);
});

test('PDF materials: attach an uploaded PDF to one lesson or project, list, and remove', async () => {
  const lesson = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'ms-ds' and m.term_no = 1 order by l.position limit 1`);
  const other = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' order by m.position, l.position limit 1`);
  const project = await h.one(h.sql, `select id from assignment_templates where program_id = 'ms-ds' and term_no = 1 order by due_offset_days limit 1`);
  const upload = (name, meta = { mimetype: 'application/pdf', size: 18000 }) =>
    ask(`insert into storage.objects (bucket_id, name, metadata) values ('course-files', $1, $2)`, [name, meta]);
  await upload('ms-ds/lessons/first/notes.pdf');
  await upload('ms-ds/assignments/p1/brief.pdf');
  const add = (path, title, l = null, p = null, pos = null) => h.one(ask, `select admin_add_material($1, $2, $3, $4, $5)`, [path, title, l, p, pos]);
  await rejects(add('ms-ds/lessons/first/notes.pdf', 'Notes'), 'one lesson or one project');
  await rejects(add('ms-ds/lessons/first/notes.pdf', 'Notes', lesson, project), 'one lesson or one project');
  await rejects(add('ms-ds/lessons/first/notes.pdf', 'Notes', '00000000-0000-0000-0000-000000000000'), 'Unknown lesson');
  await rejects(add('ms-ds/lessons/first/notes.pdf', 'Notes', other), 'The file must be a PDF in the bs-aiml/ folder');
  await rejects(add('ms-ds/lessons/first/notes.mp4', 'Video', lesson), 'must be a PDF');
  await rejects(add('ms-ds/lessons/first/missing.pdf', 'Notes', lesson), 'Upload the file first');
  await rejects(add('ms-ds/lessons/first/notes.pdf', '', lesson), 'title of 1 to 120');
  await h.sql(`insert into storage.objects (bucket_id, name, metadata) values ('course-files', 'ms-ds/lessons/first/odd.pdf', '{"mimetype": "text/plain", "size": 5}')`);
  await rejects(add('ms-ds/lessons/first/odd.pdf', 'Odd', lesson), 'Only PDF files');

  const m = await add('ms-ds/lessons/first/notes.pdf', '  Lecture   notes ', lesson);
  assert.deepEqual([m.title, m.size_bytes, m.position, m.lesson.id, m.assignment], ['Lecture notes', 18000, 1, lesson, null]);
  await rejects(add('ms-ds/lessons/first/notes.pdf', 'Again', lesson), 'already attached');
  const brief = await add('ms-ds/assignments/p1/brief.pdf', 'Project brief', null, project);
  assert.equal(brief.assignment.id, project);
  assert.equal(await h.one(h.as(S.maya.id), `select can_read_material('ms-ds/lessons/first/notes.pdf')`), true, 'students with open access can download it');
  assert.equal(await h.one(h.as(S.kenji.id), `select can_read_material('ms-ds/lessons/first/notes.pdf')`), false, 'a stopped student cannot');
  const listed = await h.one(ask, `select admin_materials('ms-ds')`);
  assert.deepEqual(listed.materials.map((x) => x.title), ['Lecture notes', 'Project brief']);
  assert.deepEqual(listed.unattached_files.map((x) => x.name), ['ms-ds/lessons/first/odd.pdf']);
  await rejects(ask(`select admin_materials('nope')`), 'Unknown program');

  assert.equal((await ask(`delete from storage.objects where name = 'ms-ds/lessons/first/notes.pdf' returning name`)).rows.length, 0,
               'an attached file cannot be deleted');
  const removed = await h.one(ask, `select admin_remove_material($1)`, [m.id]);
  assert.deepEqual(removed, { id: m.id, file_path: 'ms-ds/lessons/first/notes.pdf' });
  assert.equal(await h.one(h.as(S.maya.id), `select can_read_material('ms-ds/lessons/first/notes.pdf')`), false, 'students stop seeing it at once');
  assert.equal((await ask(`delete from storage.objects where name = 'ms-ds/lessons/first/notes.pdf' returning name`)).rows.length, 1);
  await rejects(ask(`select admin_remove_material($1)`, [m.id]), 'Unknown material');
});

test('program outline: every term\'s lessons and projects, so PDFs can be attached before a term has a batch', async () => {
  const o = await h.one(ask, `select admin_program_outline('ms-ds')`);
  const terms = (await h.sql(`select term_no from program_terms where program_id = 'ms-ds' order by term_no`)).rows.map((r) => r.term_no);
  assert.deepEqual(o.terms.map((t) => t.term), terms);
  assert.ok(terms.length > 1);
  const last = terms.at(-1);
  assert.equal(await h.one(h.sql, `select count(*)::int from batches where program_id = 'ms-ds' and term_no = $1`, [last]), 0, 'no batch for this term');
  const t = o.terms.at(-1);
  const lessons = (await h.sql(`select l.id, l.code, l.title from lessons l join modules m on m.id = l.module_id
                                where m.program_id = 'ms-ds' and m.term_no = $1 order by m.position, l.position`, [last])).rows;
  assert.ok(lessons.length > 0);
  assert.deepEqual(t.lessons, lessons, 'every lesson of the term, in course order');
  const projects = (await h.sql(`select id, title from assignment_templates where program_id = 'ms-ds' and term_no = $1
                                 order by due_offset_days, title, id`, [last])).rows;
  assert.deepEqual(t.projects, projects);
  assert.equal(typeof t.title, 'string');
  await rejects(ask(`select admin_program_outline('nope')`), 'Unknown program');
});

test('audit log: one entry for every change, none for reading; admins only; paging and per person', async () => {
  const n0 = await auditCount();
  for (const sql of [`select admin_overview()`, `select admin_students()`, `select admin_batches('all')`, `select admin_staff()`,
                     `select admin_seat_requests()`, `select admin_materials('ms-ds')`, `select admin_program_outline('ms-ds')`,
                     `select admin_audit_log()`]) await ask(sql);
  await ask(`select admin_student($1)`, [S.maya.id]);
  assert.equal(await auditCount(), n0, 'reading writes nothing');

  const changes = [
    ['access.set', `select admin_set_access($1, 'auto', 'Back to normal')`, [S.lucas.eid]],
    ['payment.record', `select admin_record_payment($1, 2450, 'cash')`, [S.kenji.eid]],
    ['batch.create', `select admin_create_batch('c-py', first_monday((current_date + interval '2 months')::date))`, []],
    ['enrollment.create', `select admin_enroll('nia@example.com', 'c-py', first_monday((current_date + interval '2 months')::date))`, []],
    ['enrollment.status', `select admin_set_enrollment_status($1, 'active')`, [S.pat.eid]],
    ['staff.assign', `select admin_assign_staff($1, $2)`, [F, inst2]],
    ['staff.unassign', `select admin_unassign_staff($1, $2)`, [F, inst2]],
    ['user.role', `select admin_set_role($1, 'instructor')`, [S.nia.id]],
  ];
  for (const [action, sql, params] of changes) {
    const before = await auditCount();
    await ask(sql, params);
    assert.equal(await auditCount(), before + 1, action);
    const a = await lastAudit();
    assert.deepEqual([a.action, a.actor_id, a.actor_email], [action, admin, 'ada@nuvora.test']);
  }
  const k = (await h.sql(`select details from admin_audit where action = 'payment.record' and person_id = $1`, [S.kenji.id])).rows[0].details;
  assert.deepEqual([k.enrollment_id, k.amount_usd, k.method], [S.kenji.eid, 2450, 'cash']);

  const log = await h.one(ask, `select admin_audit_log(5)`);
  assert.equal(log.length, 5);
  assert.deepEqual(Object.keys(log[0]).sort(), ['action', 'actor', 'actor_email', 'actor_id', 'created_at', 'details', 'id', 'person', 'person_id',
                                                'target_id', 'target_type']);
  assert.equal(log[0].action, 'user.role');
  assert.equal(log[0].actor, 'Ada Admin');
  const next = await h.one(ask, `select admin_audit_log(5, $1::timestamptz)`, [log[4].created_at]);
  assert.ok(next.every((x) => x.created_at < log[4].created_at), 'paging with p_before');
  const lucas = await h.one(ask, `select admin_audit_log(100, null, $1)`, [S.lucas.id]);
  assert.deepEqual(lucas.map((x) => [x.action, x.details.mode]), [['access.set', 'auto'], ['access.set', 'off']]);
  await rejects(ask(`select admin_audit_log(0)`), 'Limit');
  await rejects(ask(`update admin_audit set action = 'x'`), '42501');
  await rejects(ask(`delete from admin_audit`), '42501');
});

