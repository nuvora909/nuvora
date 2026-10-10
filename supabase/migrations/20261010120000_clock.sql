-- The school clock: one job that moves every date-driven part of Nuvora on by itself, so no date ever needs a
-- manual step.
--
-- "Today" is always the calendar date in New York (America/New_York, US Eastern Time), the school's time zone,
-- whatever time zone the database server runs in. Hosted Supabase runs in UTC, which is already the next day in
-- New York from 19:00 EST / 20:00 EDT until midnight; school_today() is the one place that converts.
--
-- run_clock() does four things, in this order. Each step changes only what is due, so it is safe to run any
-- number of times, and two runs at once never do the work twice:
--   1. Batches ready ahead (ensure_batches_ahead): every active program has a term-1 batch for each of the next
--      8 start dates, and every batch with students has its next term's batch ready.
--   2. Batch statuses (update_batch_statuses): scheduled -> active -> completed, and students move on:
--      progress_terms reserves the next term's seat as soon as a term is finished, and open_reserved_seats
--      makes that seat active on its own on the batch's start date.
--   3. The access rule (apply_access_rules): records and announces every stop and restore, ends manual starts
--      that have run out, and sends the 7-day and 1-day tuition reminders. (The gates themselves already decide
--      access on every request by the database clock; this step only records and announces.)
--   4. Class reminders (queue_session_reminders): "Live class soon" 24 hours ahead.
--
-- Who runs it: on hosted Supabase, the pg_cron extension, every 10 minutes (schedule_clock, at the end of this
-- file). The local database (PGlite) has no pg_cron, so the local dev server runs it instead (server/dev-server.mjs).

-- ============================================================================
-- Today in the school's time zone
-- ============================================================================
create function public.school_today(p_now timestamptz default now()) returns date
language sql stable as $$ select (p_now at time zone 'America/New_York')::date $$;

-- Every default "today" is the school's date, not the server's (current_date is UTC on hosted Supabase).
-- Bodies unchanged from 20260927000002_functions.sql and 20261002000005_terms.sql; only the defaults change.
create or replace function public.next_start_date(p_today date default public.school_today()) returns date
language plpgsql stable as $$
declare
  m date := date_trunc('month', p_today)::date;
  d date;
begin
  loop
    d := public.first_monday(m);
    if d - 7 >= p_today then return d; end if;
    m := (m + interval '1 month')::date;
  end loop;
end $$;

create or replace function public.create_monthly_batches(p_month date default (date_trunc('month', public.school_today()) + interval '1 month')::date)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p record;
  made int := 0;
  before_count int;
begin
  for p in select id from public.programs where active order by id loop
    select count(*) into before_count from public.batches
     where program_id = p.id and term_no = 1 and starts_on = public.first_monday(p_month);
    perform public.create_batch(p.id, public.first_monday(p_month), 1);
    if before_count = 0 then made := made + 1; end if;
  end loop;
  return made;
end $$;

-- Moving on to the next term, with no admin step (this replaces 20261002000005_terms.sql's progress_terms):
-- 1. In every finished batch, an active enrollment whose term requirements are met becomes completed (as before).
-- 2. A student gets one reserved seat in the next term's batch as soon as the term's requirements are met (or an
--    admin marks the term completed), while the term is still running, not only after the batch has ended. The
--    batch is on the first first-Monday after this batch ends (next_term_start) and is created if needed.
--    Continuing students always keep a place, whatever the capacity. Nothing is ever reserved twice: a student
--    who already has any enrollment in a later term of the program is skipped (also when they declined the seat).
-- 3. open_reserved_seats (below) makes the seat active on its own on the batch's start date.
-- Returns the number of seats reserved.
create or replace function public.progress_terms(p_today date default public.school_today()) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r     record;
  nb    public.batches;
  nid   uuid;
  eid   uuid;
  made  int := 0;
begin
  update public.enrollments e set status = 'completed', updated_at = now()
    from public.batches b
   where b.id = e.batch_id and b.status = 'completed' and e.status = 'active'
     and public.term_requirements_met(e.student_id, e.batch_id);

  for r in
    select e.id, e.student_id, e.program_id, b.term_no, b.ends_on, t.title
    from public.enrollments e
    join public.batches b on b.id = e.batch_id
    join public.program_terms t on t.program_id = e.program_id and t.term_no = b.term_no + 1
    where b.status <> 'cancelled'
      and (e.status = 'completed' or (e.status = 'active' and public.term_requirements_met(e.student_id, e.batch_id)))
      and not exists (select 1 from public.enrollments x join public.batches xb on xb.id = x.batch_id
                      where x.student_id = e.student_id and x.program_id = e.program_id and xb.term_no > b.term_no)
    order by b.ends_on, e.id
  loop
    nid := public.create_batch(r.program_id, public.next_term_start(r.ends_on, p_today), r.term_no + 1);
    select * into nb from public.batches where id = nid;
    insert into public.enrollments (student_id, batch_id, program_id, status, source)
    values (r.student_id, nid, r.program_id, 'reserved', 'progression')
    on conflict (student_id, batch_id) do nothing
    returning id into eid;
    if eid is null then continue; end if;
    made := made + 1;
    insert into public.notifications (user_id, kind, ref_id, title, body)
    values (r.student_id, 'term_reserved', eid,
            'Term ' || nb.term_no || ': ' || r.title || ' starts ' || to_char(nb.starts_on, 'FMMon FMDD, YYYY') || '. Your seat is reserved.',
            'Your place in ' || nb.code || ' is held for you. It opens on its own on ' || to_char(nb.starts_on, 'FMMon FMDD, YYYY') || '.')
    on conflict (user_id, kind, ref_id) do nothing;
  end loop;
  return made;
end $$;

-- A reserved seat becomes active on its own on its batch's start date (until the batch ends), once the
-- student's previous term in the program is completed. The 30-day unpaid rule then counts from that start date
-- (access_of uses the later of the start and enrolled_at, and the seat was reserved before the start). Admins
-- can still pause or withdraw a reserved seat before then: only seats still 'reserved' are opened. A seat whose
-- previous term is not completed (for example paused, or reopened by an admin) waits for an admin.
-- Returns the number of seats opened.
create function public.open_reserved_seats(p_today date default public.school_today()) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r    record;
  made int := 0;
begin
  for r in
    select e.id, e.student_id, b.code, b.term_no, t.title
    from public.enrollments e
    join public.batches b on b.id = e.batch_id
    join public.program_terms t on t.program_id = e.program_id and t.term_no = b.term_no
    where e.status = 'reserved' and b.status <> 'cancelled'
      and b.starts_on <= p_today and b.ends_on >= p_today
      and exists (select 1 from public.enrollments x join public.batches xb on xb.id = x.batch_id
                  where x.student_id = e.student_id and x.program_id = e.program_id
                    and x.status = 'completed' and xb.term_no = b.term_no - 1)
      and not exists (select 1 from public.enrollments x
                      where x.student_id = e.student_id and x.program_id = e.program_id and x.status = 'active')
    order by b.starts_on, e.id
  loop
    update public.enrollments set status = 'active', updated_at = now() where id = r.id and status = 'reserved';
    if not found then continue; end if;
    made := made + 1;
    insert into public.notifications (user_id, kind, ref_id, title, body)
    values (r.student_id, 'term_started', r.id,
            'Term ' || r.term_no || ': ' || r.title || ' has started',
            'Your seat in ' || r.code || ' is now active. This term''s lessons, live classes and projects are open in the portal.')
    on conflict (user_id, kind, ref_id) do nothing;
    perform public.sync_access(r.id, null);
  end loop;
  return made;
end $$;

-- Statuses move on, students move on, and reserved seats open on their start date.
create or replace function public.update_batch_statuses(p_today date default public.school_today()) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n1 int; n2 int;
begin
  update public.batches set status = 'completed'
   where status in ('scheduled','active') and ends_on < p_today;
  get diagnostics n2 = row_count;
  perform public.progress_terms(p_today);
  update public.batches set status = 'active'
   where status = 'scheduled' and starts_on <= p_today and ends_on >= p_today;
  get diagnostics n1 = row_count;
  perform public.open_reserved_seats(p_today);
  return n1 + n2;
end $$;

-- ============================================================================
-- Batches ready ahead (step 1 of run_clock)
-- ============================================================================
-- Term 1: every active program has a batch for each of the next p_starts start dates whose seat requests are
-- still open. The website lists the next 6 starts, the form offers 3, and request_seat accepts starts up to 200
-- days ahead (at most 7 starts), so 8 covers all of them with room to spare. Creating ahead is what lets admins
-- assign instructors early; enrolling still creates a batch on demand for any other Monday.
-- Later terms: every batch that has students (active or reserved) and has not ended has its next term's batch
-- ready, on the date its students move on to (next_term_start, the same date progress_terms and the website's
-- term table use). Empty later-term batches are not made for every month: nobody can join a later term directly,
-- so they would only fill the Batches page.
-- Returns the number of batches created (0 when everything was already there).
create function public.ensure_batches_ahead(p_today date default public.school_today(), p_starts int default 8) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  before_count int := (select count(*) from public.batches);
  d date := public.next_start_date(p_today);
  p record;
begin
  for i in 1 .. p_starts loop
    for p in select id from public.programs where active order by id loop
      perform public.create_batch(p.id, d, 1);
    end loop;
    d := public.first_monday((d + interval '1 month')::date);
  end loop;

  for p in
    select b.program_id, b.term_no, b.ends_on
    from public.batches b
    join public.programs pr on pr.id = b.program_id and pr.active
    where b.status <> 'cancelled' and b.ends_on >= p_today
      and exists (select 1 from public.program_terms t where t.program_id = b.program_id and t.term_no = b.term_no + 1)
      and exists (select 1 from public.enrollments e where e.batch_id = b.id and e.status in ('active','reserved'))
    order by b.starts_on, b.term_no, b.program_id
  loop
    perform public.create_batch(p.program_id, public.next_term_start(p.ends_on, p_today), p.term_no + 1);
  end loop;

  return (select count(*) from public.batches) - before_count;
end $$;

-- ============================================================================
-- The clock
-- ============================================================================
-- When the clock last ran and what it did (one row), so the admin Overview can show that it is running.
create table public.clock_state (
  id          boolean primary key default true check (id),
  last_run_at timestamptz not null,
  last_result jsonb not null
);
alter table public.clock_state enable row level security;
revoke all on public.clock_state from anon, authenticated;
grant all on public.clock_state to service_role;

-- Runs the four steps for the moment p_now (default: the database clock). p_now exists for tests: it sets the
-- school date for steps 1 and 2 and the 24-hour window for step 4. Step 3 always uses the database clock, like
-- every access gate. A step that fails is reported in "errors" (and as a warning in the database log) without
-- stopping the others, so, for example, a problem creating a batch never holds up access notices.
-- Returns, for example:
--   { "today": "2026-10-10", "batches_created": 0, "status_changes": 1,
--     "access": { "starts_ended": 0, "stopped": 1, "restored": 0, "reminders_7d": 2, "reminders_1d": 0 },
--     "class_reminders": 14, "errors": [] }
-- or { "today": "2026-10-10", "skipped": "another run is in progress" } when a run is already going.
create function public.run_clock(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today  date := public.school_today(p_now);
  result jsonb := jsonb_build_object('today', public.school_today(p_now));
  errors jsonb := '[]'::jsonb;
begin
  -- Two runs at once (a slow run and the next scheduled one): the second skips, the first does the work. The
  -- lock is released when the run's transaction ends. 7302810010 is this lock's id; nothing else uses it.
  if not pg_try_advisory_xact_lock(7302810010) then
    return result || jsonb_build_object('skipped', 'another run is in progress');
  end if;

  begin
    result := result || jsonb_build_object('batches_created', public.ensure_batches_ahead(today));
  exception when others then
    errors := errors || jsonb_build_object('step', 'batches', 'error', sqlerrm);
  end;
  begin
    result := result || jsonb_build_object('status_changes', public.update_batch_statuses(today));
  exception when others then
    errors := errors || jsonb_build_object('step', 'statuses', 'error', sqlerrm);
  end;
  begin
    result := result || jsonb_build_object('access', public.apply_access_rules());
  exception when others then
    errors := errors || jsonb_build_object('step', 'access', 'error', sqlerrm);
  end;
  begin
    result := result || jsonb_build_object('class_reminders', public.queue_session_reminders(24, p_now));
  exception when others then
    errors := errors || jsonb_build_object('step', 'class_reminders', 'error', sqlerrm);
  end;

  result := result || jsonb_build_object('errors', errors);
  if jsonb_array_length(errors) > 0 then raise warning 'run_clock: %', errors; end if;
  insert into public.clock_state (id, last_run_at, last_result) values (true, now(), result)
  on conflict (id) do update set last_run_at = excluded.last_run_at, last_result = excluded.last_result;
  return result;
end $$;

-- ============================================================================
-- Admin overview: also the database's own time and when the clock last ran
-- ============================================================================
-- Unchanged from 20261003000008_admin_access.sql, plus three fields:
--   now: the database clock (the portal shows it instead of the admin's device time);
--   clock_last_run: when run_clock last finished (null: it has never run, so the schedule is not on yet);
--   clock_errors: how many steps failed in that run (0 when all went well).
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform public.require_admin();
  with act as (
    select e.id as eid, e.student_id, e.program_id, b.id as batch_id, b.code, b.term_no, p.full_name, p.email, pr.name as program,
           x.state, x.open, x.ends_at, x.days_left, x.grace_end,
           case when x.state in ('stopped_unpaid','stopped_manual')
                then (select max(v.created_at) from public.access_events v where v.enrollment_id = e.id and v.kind = 'stopped') end as since
    from public.enrollments e
    join public.batches b on b.id = e.batch_id
    join public.profiles p on p.id = e.student_id
    join public.programs pr on pr.id = e.program_id
    cross join lateral public.access_of(e.id, now()) x
    where e.status = 'active'),
  item as (
    select act.*, jsonb_build_object('enrollment_id', eid, 'student_id', student_id, 'name', full_name, 'email', email,
             'program_id', program_id, 'program', program, 'batch_id', batch_id, 'batch_code', code, 'term', term_no,
             'state', state, 'days_left', days_left, 'ends_at', ends_at, 'since', since) as j
    from act)
  select jsonb_build_object(
    'students', (select count(*) from public.profiles where role = 'student'),
    'enrolled', (select count(distinct student_id) from act),
    'active_enrollments', (select count(*) from act),
    'paid', (select count(*) from act where state = 'paid'),
    'in_grace', (select count(*) from act where state = 'grace'),
    'ending_soon', (select count(*) from act where open and ends_at <= now() + interval '7 days'),
    'stopped_unpaid', (select count(*) from act where state = 'stopped_unpaid'),
    'stopped_manual', (select count(*) from act where state = 'stopped_manual'),
    'started_manual', (select count(*) from act where state = 'started_manual'),
    'reserved', (select count(*) from public.enrollments where status = 'reserved'),
    'paused', (select count(*) from public.enrollments where status = 'paused'),
    'new_seat_requests', (select count(*) from public.seat_requests where status = 'new'),
    'batches_running', (select count(*) from public.batches where status in ('scheduled','active')),
    'now', now(),
    'clock_last_run', (select last_run_at from public.clock_state),
    'clock_errors', coalesce((select jsonb_array_length(last_result->'errors') from public.clock_state), 0),
    'grace', coalesce((select jsonb_agg(j order by ends_at, lower(full_name), eid)
                       from (select * from item where state = 'grace' order by ends_at, lower(full_name), eid limit 50) g), '[]'::jsonb),
    'stopped', coalesce((select jsonb_agg(j order by coalesce(since, grace_end) desc, lower(full_name), eid)
                         from (select * from item where state in ('stopped_unpaid','stopped_manual')
                               order by coalesce(since, grace_end) desc, lower(full_name), eid limit 50) s), '[]'::jsonb))
  into result;
  return result;
end $$;

-- ============================================================================
-- Who may call what
-- ============================================================================
revoke execute on function
  public.ensure_batches_ahead(date, int),
  public.open_reserved_seats(date),
  public.run_clock(timestamptz)
  from public, anon, authenticated;
grant execute on function public.ensure_batches_ahead(date, int), public.open_reserved_seats(date), public.run_clock(timestamptz)
  to service_role;
-- next_start_date's default calls school_today, and visitors call next_start_date: the date helper stays open.
grant execute on function public.school_today(timestamptz) to anon, authenticated;

-- ============================================================================
-- The schedule (hosted Supabase, pg_cron)
-- ============================================================================
-- Schedules the clock with pg_cron when the extension is available, and quietly does nothing when it is not
-- (the local database, PGlite, has no pg_cron). Jobs are scheduled by name, and scheduling a name again replaces
-- that job, so running this twice never adds a second copy. It also removes the job names that docs/admin-api.md
-- once suggested pasting by hand, so nothing runs twice. pg_cron reads schedules in UTC; '*/10 * * * *' does not
-- depend on the time zone, and run_clock works out the New York date itself.
-- Jobs:
--   nuvora-clock          every 10 minutes   select public.run_clock()
--   nuvora-clock-history  daily, 05:30 UTC   pg_cron keeps every run's details and never deletes them: keep 14 days
-- Returns what it did, in words. If it could not switch pg_cron on, enable "pg_cron" in the Supabase dashboard
-- (Database > Extensions) and run select public.schedule_clock(); once in the SQL Editor.
create function public.schedule_clock() returns text
language plpgsql set search_path = public, pg_temp as $$
begin
  if to_regnamespace('cron') is null then
    if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      raise notice 'The clock is not scheduled: this database has no pg_cron (normal for the local database, where the dev server runs it).';
      return 'not scheduled: pg_cron is not available here';
    end if;
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      grant usage on schema cron to postgres;
      grant all privileges on all tables in schema cron to postgres;
    exception when others then
      raise notice 'The clock is not scheduled: pg_cron could not be switched on (%). Enable pg_cron in the dashboard, then run select public.schedule_clock();', sqlerrm;
      return 'not scheduled: pg_cron could not be switched on';
    end;
  end if;

  perform cron.unschedule(jobid) from cron.job
   where jobname in ('nuvora-access-rules', 'nuvora-class-reminders', 'nuvora-batch-statuses', 'nuvora-monthly-batches');
  perform cron.schedule('nuvora-clock', '*/10 * * * *', 'select public.run_clock()');
  perform cron.schedule('nuvora-clock-history', '30 5 * * *', $job$delete from cron.job_run_details where end_time < now() - interval '14 days'$job$);
  return 'scheduled: nuvora-clock every 10 minutes, nuvora-clock-history daily';
end $$;

revoke execute on function public.schedule_clock() from public, anon, authenticated;

select public.schedule_clock();
