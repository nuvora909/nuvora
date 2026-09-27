// Proves the tests have teeth: each case breaks one security or business rule on purpose,
// and the matching test file must FAIL. If a sabotaged run passes, the tests are missing something.
import { spawnSync } from 'node:child_process';
import { freshDb } from './db/helpers.mjs';

const fn = (sig, body) => `create or replace function public.${sig} language sql stable security definer
  set search_path = public, pg_temp as $$ ${body} $$;`;

const CASES = [
  ['Every student can see every batch', 'access', fn('can_see_batch(p_batch uuid) returns boolean', 'select true')],
  ['Classes table loses its row security', 'access', 'alter table public.sessions disable row level security;'],
  ['Students may change their own role', 'access', 'grant update on public.profiles to authenticated;'],
  ['Visitors can read video IDs', 'access', 'grant select on public.lessons to anon;'],
  ['Any instructor can grade any batch', 'assignments', fn('teaches(p_batch uuid) returns boolean', 'select auth.uid() is not null')],
  ['Classmates can read each other\'s work', 'assignments', 'alter table public.submissions disable row level security;'],
  ['Students can run the batch creator', 'batches', 'grant execute on function public.create_batch(text, date) to authenticated;'],
  ['Watch progress is visible to everyone', 'progress', 'alter table public.lesson_progress disable row level security;'],
  ['Students can fake their own attendance', 'enrollment', 'grant execute on function public.record_attendance(uuid, text, timestamptz, timestamptz) to authenticated;'],
];

let missed = 0;
for (const [name, file, sql] of CASES) {
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
console.log(missed ? `\n${missed} sabotage(s) went unnoticed.` : `\nAll ${CASES.length} sabotages were caught by the tests.`);
process.exit(missed ? 1 : 0);
