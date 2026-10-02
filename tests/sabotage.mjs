// Proves the tests have teeth: each case breaks one security or business rule on purpose,
// and the matching test file must FAIL. If a sabotaged run passes, the tests are missing something.
import { spawnSync } from 'node:child_process';
import { freshDb } from './db/helpers.mjs';

const fn = (sig, body) => `create or replace function public.${sig} language sql stable security definer
  set search_path = public, pg_temp as $$ ${body} $$;`;
// Rewrites one existing function in place: its current definition with `from` replaced by `to` (or several
// [from, to] pairs). Refuses (and the case counts as INVALID) when a `from` is not found, so a reworded
// function cannot make a case pass silently.
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const patch = (signature, from, to = '') => `do $patch$ declare d text := pg_get_functiondef('public.${signature}'::regprocedure);
  begin
    ${(Array.isArray(from) ? from : [[from, to]]).map(([f, t]) => `
    if position(${lit(f)} in d) = 0 then raise exception 'sabotage pattern not found in ${signature}'; end if;
    d := replace(d, ${lit(f)}, ${lit(t)});`).join('')}
    execute d;
  end $patch$;`;
const SEAT = 'request_seat(text,date,text,text,text,boolean,text,text,jsonb,text)';
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
  ['Zoom links readable straight from the table', 'portal', 'grant select on public.sessions to authenticated;'],
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
  ['The caller\'s clock unlocks Zoom links on the home page', 'home', patch('batch_summary_json(batches,uuid,timestamptz)',
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
];

// Optional filter: node tests/sabotage.mjs <test file name> runs only the cases checked by that file.
const only = process.argv[2];
const cases = CASES.filter(([, file]) => !only || file === only);
let missed = 0;
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
console.log(missed ? `\n${missed} sabotage(s) went unnoticed.` : `\nAll ${cases.length} sabotages were caught by the tests.`);
process.exit(missed ? 1 : 0);
