// The school clock (run_clock): batches made ahead for every start the website offers, statuses and terms moved
// on, the access rule applied and class reminders queued, all on the New York date, safe to repeat and to
// overlap. Also the pg_cron schedule, checked against a stand-in cron schema (the local database has no pg_cron).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { nextStarts, fromIso, isoDay } from '../../web/assets/js/dates.mjs';

let h;
const count = async (table) => h.one(h.sql, `select count(*)::int from ${table}`);
const snapshot = async () => ({ batches: await count('batches'), sessions: await count('sessions'), tasks: await count('batch_assignments'),
                                enrollments: await count('enrollments'), notifications: await count('notifications'), events: await count('access_events') });
const clock = async (at) => h.one(h.service, `select run_clock($1::timestamptz)`, [at]);
const termOneStarts = async (program) => (await h.sql(
  `select starts_on::text d from batches where program_id = $1 and term_no = 1 order by starts_on`, [program])).rows.map((r) => r.d);

before(async () => { h = await freshDb(); });

test('school_today is the New York date, at UTC day and month boundaries and across daylight saving', async () => {
  const cases = [
    ['2026-11-01T02:00:00Z', '2026-10-31'], // UTC is already November; New York is 22:00 EDT on Oct 31
    ['2026-11-01T04:30:00Z', '2026-11-01'], // 00:30 EDT, the night the clocks go back
    ['2026-11-01T06:30:00Z', '2026-11-01'], // 01:30 EST, after the change
    ['2027-01-01T04:59:00Z', '2026-12-31'], // 23:59 EST on New Year's Eve
    ['2027-01-01T05:00:00Z', '2027-01-01'],
    ['2027-03-14T04:30:00Z', '2027-03-13'], // 23:30 EST, the night the clocks go forward
    ['2027-03-15T03:30:00Z', '2027-03-14'], // 23:30 EDT
  ];
  for (const zone of ['UTC', 'Asia/Kolkata', 'Pacific/Auckland']) {
    await h.sql(`set time zone '${zone}'`);
    for (const [at, day] of cases) assert.equal(await h.one(h.sql, `select school_today($1::timestamptz)::text`, [at]), day, `${at} with the server in ${zone}`);
  }
  await h.sql(`reset time zone`);
});

test('no function takes "today" from the server date: every default is the New York date', async () => {
  const rows = (await h.sql(`select p.proname, pg_get_function_arguments(p.oid) args from pg_proc p
                             where p.pronamespace = 'public'::regnamespace`)).rows;
  assert.deepEqual(rows.filter((r) => /current_date|date_trunc\('month', now\(\)\)/i.test(r.args)).map((r) => r.proname), []);
  for (const f of ['next_start_date', 'progress_terms', 'update_batch_statuses', 'open_reserved_seats', 'ensure_batches_ahead', 'create_monthly_batches']) {
    assert.match(rows.find((r) => r.proname === f).args, /school_today\(\)/, f);
  }
});

test('one run makes term-1 batches for every start the website offers and every start a seat request accepts', async () => {
  const at = '2026-10-11T16:00:00Z';
  const res = await clock(at);
  assert.equal(res.today, '2026-10-11');
  assert.deepEqual(res.errors, []);
  const programs = (await h.sql(`select id from programs where active order by id`)).rows.map((r) => r.id);
  assert.ok(programs.length >= 5);
  assert.equal(res.batches_created, programs.length * 8);
  const website = nextStarts(6, fromIso('2026-10-11')).map((s) => isoDay(s.start));
  const requestable = (await h.sql(`select d::date::text d from generate_series('2026-10-11'::date, '2027-06-30'::date, interval '1 day') d
                                    where seat_start_problem(d::date, '2026-10-11') is null order by d`)).rows.map((r) => r.d);
  assert.ok(requestable.length >= 6, 'seat requests reach about 200 days ahead');
  for (const p of programs) {
    const have = await termOneStarts(p);
    for (const d of [...website, ...requestable]) assert.ok(have.includes(d), `${p} has a batch on ${d}`);
    assert.deepEqual(have, ['2026-11-02', '2026-12-07', '2027-01-04', '2027-02-01', '2027-03-01', '2027-04-05', '2027-05-03', '2027-06-07']);
  }
  // Each batch made ahead has its classes, project due dates and Jitsi links.
  const b = await h.one(h.sql, `select id from batches where program_id = 'bs-aiml' and starts_on = '2027-06-07'`);
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions where batch_id = $1 and join_url like 'https://meet.jit.si/%'`, [b]), 24);
  assert.equal(await h.one(h.sql, `select count(*)::int from batch_assignments where batch_id = $1`, [b]), 3);
  // Nothing is made for later terms while nobody is in a batch.
  assert.equal(await h.one(h.sql, `select count(*)::int from batches where term_no > 1`), 0);
});

test('running again, at once or later the same day, changes nothing; the next day adds only what is new', async () => {
  const was = await snapshot();
  for (const at of ['2026-10-11T16:00:00Z', '2026-10-11T16:10:00Z', '2026-10-12T03:59:00Z']) {
    const res = await clock(at);
    assert.deepEqual([res.today, res.batches_created, res.status_changes, res.errors], ['2026-10-11', 0, 0, []], at);
  }
  // Two runs sent at the same moment: the second finds everything done.
  const both = await Promise.all([clock('2026-10-11T16:20:00Z'), clock('2026-10-11T16:20:00Z')]);
  assert.deepEqual(both.map((r) => r.batches_created), [0, 0]);
  assert.deepEqual(await snapshot(), was);
  // Oct 27 (New York): seat requests for Nov 2 have closed, so one more start (Jul 5, 2027) comes into reach.
  const res = await clock('2026-10-27T14:00:00Z');
  assert.equal(res.batches_created, (await h.one(h.sql, `select count(*)::int from programs where active`)));
  assert.ok((await termOneStarts('bs-aiml')).includes('2027-07-05'));
});

test('the New York date decides, not the UTC date: 21:30 EDT on the day requests close still counts that start', async () => {
  const g = await freshDb();
  const res = await g.one(g.service, `select run_clock('2026-10-27T01:30:00Z')`); // Oct 26, 21:30 in New York
  assert.equal(res.today, '2026-10-26');
  assert.equal(await g.one(g.sql, `select min(starts_on)::text from batches where program_id = 'bs-aiml'`), '2026-11-02');
});

test('a run holds the clock lock until it ends, so overlapping runs never work at the same time', async () => {
  const held = await h.db.transaction(async (tx) => {
    await tx.query(`select run_clock('2026-10-11T16:30:00Z')`);
    // pg_try_advisory_xact_lock(7302810010): classid is the high 32 bits, objid the low 32 bits.
    return (await tx.query(`select count(*)::int n from pg_locks where locktype = 'advisory' and classid = 1 and objid = 3007842714 and granted`)).rows[0].n;
  });
  assert.equal(held, 1, 'held during the run');
  assert.equal(await h.one(h.sql, `select count(*)::int from pg_locks where locktype = 'advisory'`), 0, 'released when the run ends');
});

test('statuses move on, the access rule is applied and class reminders are queued, all through run_clock', async () => {
  const g = await freshDb();
  // A batch that started about ten weeks ago (by the real clock: the access rule always uses the database clock).
  const start = await g.one(g.sql, `select (school_today() - 70 - (extract(isodow from school_today() - 70)::int - 1))::text`);
  const batch = await g.one(g.service, `select create_batch('bs-aiml', $1)`, [start]);
  const unpaid = await g.user('unpaid@test.io');
  const fresh = await g.user('fresh@test.io');
  for (const s of [unpaid, fresh]) await g.service(`select enroll_student($1, 'bs-aiml', $2)`, [s, start]);
  await g.sql(`update enrollments set enrolled_at = now() - interval '70 days' where student_id = $1`, [unpaid]);
  const soon = await g.one(g.sql, `insert into sessions (batch_id, title, starts_at, ends_at) values ($1, 'Extra class', now() + interval '2 hours', now() + interval '3 hours') returning id`, [batch]);

  const res = await g.one(g.service, `select run_clock()`);
  assert.deepEqual(res.errors, []);
  assert.ok(res.status_changes >= 1);
  assert.equal(await g.one(g.sql, `select status from batches where id = $1`, [batch]), 'active');
  assert.equal(res.access.stopped, 1);
  assert.deepEqual((await g.sql(`select kind, state from access_events`)).rows, [{ kind: 'stopped', state: 'stopped_unpaid' }]);
  assert.equal(await g.one(g.as(unpaid), `select count(*)::int from notifications where kind = 'access_stopped'`), 1);
  assert.ok(res.class_reminders >= 1);
  assert.equal(await g.one(g.sql, `select count(*)::int from notifications where kind = 'reminder_24h' and ref_id = $1 and user_id = $2`, [soon, fresh]), 1);
  assert.equal(await g.one(g.sql, `select count(*)::int from notifications where kind = 'reminder_24h' and user_id = $1`, [unpaid]), 0, 'no reminder while access is stopped');
  // When it last ran is visible to admins.
  const admin = await g.user('admin@test.io', 'admin');
  const o = await g.one(g.as(admin), `select admin_overview()`);
  assert.ok(o.clock_last_run);
  assert.equal(o.clock_errors, 0);
  // Again: nothing is announced twice.
  const again = await g.one(g.service, `select run_clock()`);
  assert.deepEqual([again.access.stopped, again.class_reminders], [0, 0]);
});

test('a continuing student: the next term\'s batch is ready while the term runs, and the seat opens on its start date', async () => {
  const g = await freshDb();
  const t1 = await g.one(g.service, `select create_batch('ms-aml', '2026-10-05')`);
  const ana = await g.user('ana@test.io');
  await g.service(`select enroll_student($1, 'ms-aml', '2026-10-05')`, [ana]);
  await g.one(g.service, `select run_clock('2026-10-11T16:00:00Z')`);
  assert.equal(await g.one(g.sql, `select count(*)::int from batches where program_id = 'ms-aml' and term_no = 2 and starts_on = '2027-01-04'`), 1,
               'term 2 is ready more than 12 weeks ahead');
  // Ana finishes term 1 (every lesson, every project passed) in December.
  await g.sql(`insert into lesson_progress (student_id, lesson_id, watched_seconds, completed_at)
               select $1, l.id, l.duration_seconds, now() from lessons l join modules m on m.id = l.module_id
               where m.program_id = 'ms-aml' and m.term_no = 1`, [ana]);
  await g.sql(`insert into submissions (assignment_id, student_id, link_url, status, grade) select id, $1, 'https://github.com/ana/p', 'graded', 'proficient'
               from batch_assignments where batch_id = $2`, [ana, t1]);
  await g.one(g.service, `select run_clock('2026-12-15T16:00:00Z')`);
  const seats = async () => (await g.sql(`select b.term_no, b.starts_on::text s, e.status from enrollments e join batches b on b.id = e.batch_id
                                          where e.student_id = $1 order by b.term_no`, [ana])).rows;
  assert.deepEqual(await seats(), [{ term_no: 1, s: '2026-10-05', status: 'active' }, { term_no: 2, s: '2027-01-04', status: 'reserved' }]);
  await g.one(g.service, `select run_clock('2027-01-04T04:59:00Z')`); // Jan 3, 23:59 in New York
  assert.equal((await seats())[1].status, 'reserved');
  await g.one(g.service, `select run_clock('2027-01-04T05:00:00Z')`); // Jan 4, 00:00 in New York
  assert.deepEqual(await seats(), [{ term_no: 1, s: '2026-10-05', status: 'completed' }, { term_no: 2, s: '2027-01-04', status: 'active' }]);
});

test('the schedule: pg_cron absent here, so nothing is scheduled and nothing breaks', async () => {
  assert.equal(await h.one(h.sql, `select to_regnamespace('cron') is null`), true);
  assert.equal(await h.one(h.sql, `select schedule_clock()`), 'not scheduled: pg_cron is not available here');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await h.one(h.sql, `select has_function_privilege($1, 'public.schedule_clock()', 'execute')`, [role]), false, role);
  }
});

test('the schedule: with pg_cron, one job every 10 minutes and a daily history clean-up, by name, safe to repeat', async () => {
  const g = await freshDb();
  // A stand-in for pg_cron's schema with its documented signatures: cron.schedule(job_name, schedule, command)
  // replaces a job of the same name; cron.unschedule(job_id) removes one.
  await g.db.exec(`
    create schema cron;
    create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null);
    create table cron.calls (n serial, fn text, args text[]);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
    declare id bigint;
    begin
      insert into cron.calls (fn, args) values ('schedule', array[job_name, schedule, command]);
      insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into id;
      return id;
    end $$;
    create function cron.unschedule(job_id bigint) returns boolean language plpgsql as $$
    begin
      insert into cron.calls (fn, args) values ('unschedule', array[job_id::text]);
      delete from cron.job where jobid = job_id;
      return found;
    end $$;
    insert into cron.job (jobname, schedule, command) values
      ('nuvora-access-rules', '0 * * * *', 'select public.apply_access_rules()'), ('someone-else', '0 0 * * *', 'select 1');`);
  const jobs = async () => (await g.sql(`select jobname, schedule, command from cron.job order by jobname`)).rows;
  const expected = [
    { jobname: 'nuvora-clock', schedule: '*/10 * * * *', command: 'select public.run_clock()' },
    { jobname: 'nuvora-clock-history', schedule: '30 5 * * *', command: `delete from cron.job_run_details where end_time < now() - interval '14 days'` },
    { jobname: 'someone-else', schedule: '0 0 * * *', command: 'select 1' },
  ];
  assert.equal(await g.one(g.sql, `select schedule_clock()`), 'scheduled: nuvora-clock every 10 minutes, nuvora-clock-history daily');
  assert.deepEqual(await jobs(), expected, 'the old hand-pasted job is removed, other jobs are left alone');
  assert.deepEqual((await g.sql(`select fn, args from cron.calls where fn = 'schedule' order by n`)).rows.map((r) => [r.fn, ...r.args]), [
    ['schedule', 'nuvora-clock', '*/10 * * * *', 'select public.run_clock()'],
    ['schedule', 'nuvora-clock-history', '30 5 * * *', `delete from cron.job_run_details where end_time < now() - interval '14 days'`],
  ]);
  await g.sql(`select schedule_clock()`);
  assert.deepEqual(await jobs(), expected, 'running it again adds no second copy');
  // The scheduled command runs as written.
  assert.deepEqual((await g.one(g.service, expected[0].command)).errors, []);
});
