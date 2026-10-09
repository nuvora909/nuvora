// Proves the tests have teeth: each case breaks one security or business rule on purpose,
// and the matching test file must FAIL. If a sabotaged run passes, the tests are missing something.
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './db/helpers.mjs';

const fn = (sig, body) => `create or replace function public.${sig} language sql stable security definer
  set search_path = public, pg_temp as $$ ${body} $$;`;
// Rewrites one existing function in place: its current definition with `from` replaced by `to` (or several
// [from, to] pairs). Refuses (and the case counts as INVALID) when a `from` is not found, so a reworded
// function cannot make a case pass silently. Line endings are compared as \n on both sides (a checkout may
// give the migrations or this file Windows line endings).
const lit = (s) => `'${s.replace(/\r\n/g, '\n').replace(/'/g, "''")}'`;
const patch = (signature, from, to = '') => `do $patch$ declare d text := replace(pg_get_functiondef('public.${signature}'::regprocedure), chr(13) || chr(10), chr(10));
  begin
    ${(Array.isArray(from) ? from : [[from, to]]).map(([f, t]) => `
    if position(${lit(f)} in d) = 0 then raise exception 'sabotage pattern not found in ${signature}'; end if;
    d := replace(d, ${lit(f)}, ${lit(t)});`).join('')}
    execute d;
  end $patch$;`;
const SEAT = 'request_seat(text,date,text,text,text,boolean,text,text,jsonb,text)';
const RULE = 'access_rule(text,text,timestamptz,boolean,timestamptz,timestamptz)';
const SUBMIT = 'submit_assignment(uuid,text,text,text)';
const const_seat = (name, sql) => [name, 'seat_requests', sql];
const ANY_ENROLLMENT =`exists (select 1 from public.enrollments x where x.student_id = uid and x.program_id = m.program_id and x.status in ('active','completed'))`;

const CASES = [
  ['Every student can see every batch', 'access', fn('can_see_batch(p_batch uuid) returns boolean', 'select true')],
  ['Classes table loses its row security', 'access', 'alter table public.sessions disable row level security;'],
  ['Students may change their own role', 'access', 'grant update on public.profiles to authenticated;'],
  ['Visitors can read video IDs', 'access', 'grant select on public.lessons to anon;'],
  ['Any instructor can grade any batch', 'assignments', fn('teaches(p_batch uuid) returns boolean', 'select auth.uid() is not null')],
  ['Classmates can read each other\'s work', 'assignments', 'alter table public.submissions disable row level security;'],
  ['Students can run the batch creator', 'batches', 'grant execute on function public.create_batch(text, date, int) to authenticated;'],
  ['Watch progress is visible to everyone', 'progress', 'alter table public.lesson_progress disable row level security;'],
  ['Jitsi links readable straight from the table', 'portal', 'grant select on public.sessions to authenticated;'],
  ['Join links handed out days early', 'portal', `create or replace function public.my_sessions(p_batch uuid) returns jsonb language sql stable
     security definer set search_path = public, pg_temp as $$ select coalesce(jsonb_agg(jsonb_build_object('id', id, 'join_url', join_url,
     'phase', 'upcoming', 'has_recording', false) order by starts_at), '[]') from sessions where batch_id = (public.portal_batch(p_batch)).id $$;`],
  ['Any instructor sees every grading queue', 'portal', `create or replace function public.staff_grading_queue(p_batch uuid default null) returns jsonb
     language sql stable security definer set search_path = public, pg_temp as $$ select coalesce(jsonb_agg(jsonb_build_object('id', s.id,
     'student', jsonb_build_object('email', p.email), 'attempt', s.attempt, 'previous_feedback', s.feedback)), '[]') from submissions s
     join profiles p on p.id = s.student_id where s.status = 'submitted' $$;`],
  ['Course PDFs downloadable by any signed-in user', 'materials', `create policy leak on storage.objects for select to authenticated using (bucket_id = 'course-files');`],
  ['Students may upload files into course storage', 'materials', `create policy up on storage.objects for insert to authenticated with check (true);`],
  ['A new function left open to visitors', 'privileges', `create function public.leak() returns int language sql as 'select 1';`],
  ['A new table without row security', 'privileges', `create table public.leak (x int);`],
  ['Students can fake their own attendance', 'enrollment', 'grant execute on function public.record_attendance(uuid, text, timestamptz, timestamptz) to authenticated;'],
  // Terms: a student studies only the terms they hold an active or completed enrollment for.
  ['Reserved seats open the next term early', 'terms', fn('term_open(p_student uuid, p_program text, p_term int) returns boolean',
    `select exists (select 1 from enrollments e join batches b on b.id = e.batch_id where e.student_id = p_student
     and e.program_id = p_program and b.term_no = p_term and e.status in ('active','completed','reserved'))`)],
  ['Lesson pages ignore the term', 'terms', patch('my_lesson(uuid)', [['public.term_open(uid, m.program_id, m.term_no)', ANY_ENROLLMENT],
    ['and b.term_no = m.term_no and e.status', 'and e.status']])],
  ['Watch tracking ignores the term', 'terms', patch('record_progress(uuid,int,int,int)', 'public.term_open(uid, m.program_id, m.term_no)', ANY_ENROLLMENT)],
  ['Reading completion ignores the term', 'terms', patch('mark_reading_done(uuid)', 'public.term_open(uid, m.program_id, m.term_no)', ANY_ENROLLMENT)],
  ['Course page lists every term', 'terms', patch('my_course(uuid)', 'and (m.term_no = b.term_no or public.term_open(uid, b.program_id, m.term_no))')],
  ['PDFs of every term downloadable', 'terms', patch('can_read_material(text)', 'and b.term_no = coalesce(public.material_term(mt.lesson_id, mt.assignment_template_id), b.term_no)')],
  ['A batch runs every term\'s classes and projects', 'terms', patch('create_batch(text,date,int)', 'and t.term_no = p_term')],
  ['Students progress without finishing the term', 'terms', patch('progress_terms(date)', 'and public.term_requirements_met(e.student_id, e.batch_id)')],
  ['Each daily run reserves another seat', 'terms', patch('progress_terms(date)', 'and xb.term_no > b.term_no)', 'and false)')],
  // Seat requests from the website.
  const_seat('Visitors can read seat requests', 'grant select on public.seat_requests to anon;'),
  const_seat('Any signed-in user can list seat requests', patch('admin_seat_requests(text)', 'perform public.require_admin();')),
  const_seat('Repeated requests are stored again', patch(SEAT, `and created_at > now() - interval '30 days'`, 'and false')),
  const_seat('No daily limit per email', patch(SEAT, `interval '24 hours') >= 5 then`, `interval '24 hours') >= 500 then`)),
  const_seat('Applications accepted after the apply-by date', patch('seat_start_problem(date,date)', 'when p_start - 7 < p_today', 'when p_start < p_today')),
  const_seat('Requests accepted without consent', patch(SEAT, 'if p_consent is not true then', 'if false then')),
  const_seat('Unknown answer keys stored', patch(SEAT, `where d.key not in ('role','goal','hours','coding','has_bachelor','match','score')
                   or`, 'where')),
  const_seat('Admins are not told about new requests', 'drop trigger seat_request_created on public.seat_requests;'),
  // The student home: own data only, verified events only, the real clock for anything time-gated.
  ['The caller\'s clock unlocks Jitsi links on the home page', 'home', patch('batch_summary_json(batches,uuid,timestamptz)',
    `when now() between s.starts_at - interval '15 minutes' and s.ends_at`, `when p_now between s.starts_at - interval '15 minutes' and s.ends_at`)],
  ['The home page opens any batch', 'home', patch('my_home(uuid,timestamptz)', 'b := public.portal_batch(p_batch);', 'select * into b from public.batches where id = p_batch;')],
  ['The streak is sent even when switched off', 'home', patch('my_home(uuid,timestamptz)', `'streak', case when me.show_streak then`, `'streak', case when true then`)],
  ['Replaying a video counts as a learning day', 'home', patch('on_lesson_progress()', 'if added <= 0 and not finished then return new; end if;')],
  ['Streaks survive two missed days', 'home', patch('streak_of(date[],date)', '>= day - 2', '>= day - 3')],
  ['Submitting counts as passing', 'home', patch('achievements_json(uuid,text,timestamptz)',
    `(select min(graded_at) from subs where grade in ('proficient','distinguished'))`, '(select min(submitted_at) from subs)')],
  ['Badges without passing every project', 'home', patch('badges_json(uuid,text)', 'and public.term_requirements_met(p_user, b.id)')],
  ['Achievements announced again on every event', 'home', patch('award_achievements(uuid)', `(x->>'ref')::uuid`, 'gen_random_uuid()')],
  ['A finished lesson counts as mastered without its project', 'home', patch('gaps_json(uuid,text,text)',
    `when lp.completed_at is not null and pj.passed then 'mastered'`, `when lp.completed_at is not null then 'mastered'`)],
  // Tuition and access: one rule, by the database clock, at every gate; the hourly job announces each change once.
  ['Unpaid terms never stop (the 30-day check is gone)', 'tuition', patch(RULE, `when p_at < p_grace_start + interval '30 days' then 'grace'`, `when true then 'grace'`)],
  ['Access stops a day late', 'tuition', patch(RULE, `p_grace_start + interval '30 days'`, `p_grace_start + interval '31 days'`)],
  ['Access stops at 30 days and a second, not at 30 days', 'tuition', patch(RULE, 'when p_at < p_grace_start', 'when p_at <= p_grace_start')],
  ['Late joiners lose their 30 days', 'tuition', patch('access_of(uuid,timestamptz)',
    'greatest(b.starts_on::timestamp at time zone b.timezone, e.enrolled_at)', 'b.starts_on::timestamp at time zone b.timezone')],
  ['The portal trusts the caller\'s clock (p_now) for access', 'tuition', patch('my_dashboard(timestamptz)', [
    [`where e.student_id = uid and e.status = 'active' and public.access_open(e)), '[]'::jsonb)`,
     `where e.student_id = uid and e.status = 'active' and (public.access_of(e.id, p_now)).open), '[]'::jsonb)`],
    ['cross join lateral public.access_of(e.id, now()) x', 'cross join lateral public.access_of(e.id, p_now) x']])],
  ['Voided payments still count', 'tuition', patch('access_of(uuid,timestamptz)', 'where enrollment_id = e.id and voided_at is null', 'where enrollment_id = e.id')],
  ['A payment overrides a manual stop', 'tuition', patch(RULE, `when p_mode = 'off' then 'stopped_manual'`, '')],
  ['Manual starts never end', 'tuition', patch(RULE, `when p_mode = 'on' and (p_until is null or p_at < p_until)`, `when p_mode = 'on'`)],
  ['Paused or withdrawn students keep access when paid', 'tuition', patch(RULE, `when p_status is null or p_status not in ('active','completed') then 'closed'`, '')],
  ['Stopped students still see their batch', 'tuition', patch('can_see_batch(uuid)', `and e.status = 'active' and public.access_open(e))`, `and e.status = 'active')`)],
  ['Stopped students still get their active batches', 'tuition', patch('my_active_batches()', 'and public.access_open(e)')],
  ['Stopped students still download PDFs', 'tuition', patch('can_read_material(text)', `and public.access_open(e))`, ')')],
  ['Stopped students can still submit work', 'tuition', patch(SUBMIT, 'if not public.access_open(e) then', 'if false then')],
  ['Earlier terms stay open while the current term is stopped', 'tuition', patch('access_open(enrollments)', `and (e.status = 'active' or not exists (`, `and (true or not exists (`)],
  ['Students can read the payments ledger', 'tuition', 'grant select on public.payments to authenticated;'],
  ['The hourly job sends reminders again on every run', 'tuition', patch('apply_access_rules()', `md5(e.id::text || '/' || extract(epoch from x.ends_at)::text)::uuid`, 'gen_random_uuid()')],
  ['Each stop is announced again on every run', 'tuition', patch('sync_access(uuid,uuid)', `set recorded = case when x.open then 'on' else 'off' end, recorded_at = now()`, 'set recorded_at = now()')],
  ['Admins are not told about automatic stops', 'tuition', patch('sync_access(uuid,uuid)', `from public.profiles p where p.role = 'admin'`, 'from public.profiles p where false')],
  ['Expired manual starts are never switched back', 'tuition', patch('apply_access_rules()', 'where mode = \'on\' and until <= now()', 'where false')],
  ['Stopped students still hear that a recording is ready', 'tuition', patch('attach_recording(uuid,text)',
    `e.status = 'active' and public.access_open(e)`, `e.status = 'active'`)],
  ['Voiding a payment leaves the stop for the hourly job to announce', 'tuition', patch('admin_void_payment(uuid,text)',
    'perform public.sync_access(pay.enrollment_id, auth.uid());')],
  // The admin area: every admin function checks the role itself and writes the audit log.
  ['Recording a payment forgets the admin check', 'admin', patch('admin_record_payment(uuid,numeric,text,text,text,date)', 'perform public.require_admin();')],
  ['The students database forgets the admin check', 'admin', patch('admin_students(text,text,uuid,text,text,text,text,boolean,integer,integer)', 'perform public.require_admin();')],
  ['Admin changes are not written to the audit log', 'admin', `create or replace function public.audit(p_action text, p_target_type text, p_target_id text,
     p_person uuid, p_details jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$ begin end $$;`],
  ['Duplicate payment references accepted', 'admin', 'drop index public.payments_reference;'],
  ['Capacity can be cut below the seats taken', 'admin', patch('admin_update_batch(uuid,integer,text,text)', 'if p_capacity < taken then', 'if false then')],
  ['The last admin can be demoted', 'admin', patch('change_role(uuid,text)', `(select count(*) from public.profiles where role = 'admin') <= 1`, 'false')],
  ['Admins can attach a file that was never uploaded', 'admin', patch('admin_add_material(text,text,uuid,uuid,integer)', `if not found then raise exception 'Upload the file first' using errcode = '22023'; end if;`)],
  ['"Pausing within 7 days" lists every open student', 'admin', patch('admin_students(text,text,uuid,text,text,text,text,boolean,integer,integer)',
    `and (x).ends_at <= now() + interval '7 days'`)],
  ['The program outline forgets the admin check', 'admin', patch('admin_program_outline(text)', 'perform public.require_admin();')],
  // PDF uploads to the course-files bucket.
  ['Non-PDF files can be uploaded', 'materials', patch('can_upload_course_file(text,jsonb)', `and coalesce(p_metadata->>'mimetype', 'application/pdf') = 'application/pdf'`)],
  ['Files over 50 MB can be uploaded', 'materials', patch('can_upload_course_file(text,jsonb)', `<= 52428800`, '<= 5242880000')],
  ['Uploads accepted outside a program folder', 'materials', patch('course_file_path_ok(text)', `and exists (select 1 from public.programs where id = split_part(p_name, '/', 1))`)],
  ['Files still attached to a lesson can be deleted', 'materials', patch('can_delete_course_file(text)', 'and not exists (select 1 from public.materials where file_path = p_name)')],
  ['Instructors can upload course files', 'materials', patch('can_upload_course_file(text,jsonb)', 'public.is_admin() and',
    `(public.is_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'instructor')) and`)],
  // Seat requests: every accepted request gets the same answer.
  const_seat('A repeat request reveals the earlier reference', patch(SEAT, `if found then return jsonb_build_object('ok', true); end if;`,
    `if found then return jsonb_build_object('ok', true, 'reference', (select reference from public.seat_requests where email = v_email
       and program_id = prog.id and start_date = p_start order by created_at limit 1)); end if;`)),
  const_seat('A repeat request is flagged as a duplicate', patch(SEAT, `if found then return jsonb_build_object('ok', true); end if;`,
    `if found then return jsonb_build_object('ok', true, 'duplicate', true); end if;`)),
  const_seat('Over the daily limit the form answers with an error', patch(SEAT, `interval '24 hours') >= 5 then
    return jsonb_build_object('ok', true);`, `interval '24 hours') >= 5 then
    raise exception 'You have sent several requests from this email today.' using errcode = '22023';`)),
];

// The portal in the browser. Each case changes one line in a fresh copy of portal/ (the checkout is never
// touched), the browser tests serve that copy (NUVORA_PORTAL_DIR, see playwright.config.mjs), and the one
// test that must notice runs against it. Needs Microsoft Edge, like the browser tests; set NUVORA_E2E_PORT to
// run it next to another browser run. [name, spec, test title, file in portal/, text, replacement]
const BROWSER_CASES = [
  ['The CSV export lets spreadsheet formulas through', 'admin', 'CSV export holds every row', 'js/csv.js', "if (FORMULA.test(s)) s = `'${s}`;", ''],
  ['Any role can open the admin pages', 'admin', 'only admins see and reach the admin area', 'js/app.js',
    "if (r.who === 'admin' && !isAdmin()) return go(homeHash());", ''],
  ['The browser stops checking that an upload is a PDF', 'admin', 'upload a PDF to a lesson', 'js/api.js',
    "if (file.type !== 'application/pdf' || !/.pdf$/i.test(file.name)) return", 'if (false) return'],
  ['"Keep me signed in" starts ticked', 'auth', 'keep me signed in', 'js/pages/auth.js',
    '<input type="checkbox" id="remember">', '<input type="checkbox" id="remember" checked>'],
];
const PLAYWRIGHT = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const PORTAL = fileURLToPath(new URL('../portal', import.meta.url));

async function runBrowserCase([name, spec, title, file, from, to]) {
  const dir = await mkdtemp(join(tmpdir(), 'nuvora-sabotage-'));
  try {
    await cp(PORTAL, join(dir, 'portal'), { recursive: true });
    const path = join(dir, 'portal', file);
    const text = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(from)) return { invalid: `pattern not found in portal/${file}` };
    await writeFile(path, text.replace(from, to));
    const r = spawnSync(process.execPath, [PLAYWRIGHT, 'test', `tests/e2e/${spec}.spec.mjs`, '-g', title, '--reporter=line', `--output=${join(dir, 'results')}`],
      { encoding: 'utf8', env: { ...process.env, NUVORA_PORTAL_DIR: join(dir, 'portal') } });
    const fails = Number(r.stdout.match(/^\s*(\d+) failed/m)?.[1] ?? 0);
    return { caught: r.status !== 0 && fails > 0, fails, file: `${spec}.spec` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Optional filter: node tests/sabotage.mjs <test file name> runs only the cases checked by that file
// (a database test such as "tuition", or a browser spec such as "admin.spec"); "db" or "browser" runs one kind.
const only = process.argv[2];
const cases = CASES.filter(([, file]) => !only || only === 'db' || file === only);
const browserCases = BROWSER_CASES.filter(([, spec]) => !only || only === 'browser' || `${spec}.spec` === only);
const total = cases.length + browserCases.length;
let missed = 0;
for (const c of browserCases) {
  const r = await runBrowserCase(c);
  if (r.invalid) { missed++; console.log(`INVALID ${c[0]}: ${r.invalid}`); continue; }
  if (!r.caught) missed++;
  console.log(`${r.caught ? 'CAUGHT' : 'MISSED'}  ${c[0]}  (${r.file}: ${r.fails} test${r.fails === 1 ? '' : 's'} failed)`);
}
for (const [name, file, sql] of cases) {
  // A sabotage that fails to apply would make the tests fail for the wrong reason, so check it first.
  try { await (await freshDb()).db.exec(sql); } catch (e) {
    missed++; console.log(`INVALID ${name}: ${e.message}`); continue;
  }
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', `tests/db/${file}.test.mjs`],
    { encoding: 'utf8', env: { ...process.env, NUVORA_SABOTAGE_SQL: sql } });
  const fails = Number(r.stdout.match(/^ℹ fail (\d+)$/m)?.[1] ?? 0);
  const caught = r.status !== 0 && fails > 0;
  if (!caught) missed++;
  console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${name}  (${file}: ${fails} test${fails === 1 ? '' : 's'} failed)`);
}
console.log(missed ? `\n${missed} sabotage(s) went unnoticed.` : `\nAll ${total} sabotages were caught by the tests.`);
process.exit(missed ? 1 : 0);

