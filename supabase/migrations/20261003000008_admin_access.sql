-- The admin area: tuition payments, the access rule for unpaid terms, manual access control, the admin audit
-- log, and the admin functions behind the portal's admin pages (students database, batches, staff, seat
-- requests, PDF uploads). Every function is documented for the portal in docs/admin-api.md.
--
-- The access rule (owner decision, 2026-10-03). Tuition is paid per 12-week term; each enrollment is one term.
--   * Automatic (default): access is open while the term is paid (at least one payment that is not voided),
--     or while fewer than 30 days have passed since the term started (00:00 on the batch's start date, in the
--     batch's time zone), or since the enrollment was created if that is later (late joiners get 30 days too).
--   * At exactly 30 days unpaid, access stops. It is decided on every request with the database clock now(),
--     never a time sent by the caller, by one rule (access_rule) applied through access_open().
--   * Admins can stop access (with a reason), start it (optionally until a date; overrides the payment rule)
--     or return it to automatic, at any time. Every admin change is written to the audit log.
--   * Status comes first: reserved, paused and withdrawn enrollments open nothing. A completed term stays open
--     for review only while its own access is open and the program's current (active) term is open too.
--   * The hourly job apply_access_rules() records each stop and restore in the access history and sends the
--     stopped and restored notifications and the 7-day and 1-day reminders, each exactly once.

-- ============================================================================
-- Tables
-- ============================================================================
-- List price per term (from TUITION in scripts/catalog.mjs), shown to admins next to what was paid.
alter table public.programs add column tuition_per_term_usd numeric(10,2) check (tuition_per_term_usd >= 0);

-- The payments ledger. Recorded by admins today (Razorpay in Phase 4). Never deleted: mistakes are voided.
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  amount_usd    numeric(10,2) not null check (amount_usd between 0 and 100000),
  method        text not null check (method in ('bank_transfer','cash','waiver','other')),
  reference     text check (char_length(reference) between 1 and 100),
  note          text check (char_length(note) <= 1000),
  paid_on       date not null,
  source        text not null default 'admin' check (source in ('admin','razorpay')),
  recorded_by   uuid references public.profiles(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references public.profiles(id) on delete set null,
  void_reason   text check (char_length(void_reason) between 1 and 500),
  check (method = 'waiver' or amount_usd > 0),
  check ((voided_at is null) = (void_reason is null))
);
create index payments_enrollment on public.payments (enrollment_id);
-- A reference names one payment. Voiding frees it, so a payment entered wrongly can be recorded again.
create unique index payments_reference on public.payments (lower(reference)) where reference is not null and voided_at is null;

-- The manual setting of an enrollment ('auto' unless an admin changed it), and the last access state the
-- hourly job or an admin action recorded, so each opening and closing is announced once.
create table public.enrollment_access (
  enrollment_id uuid primary key references public.enrollments(id) on delete cascade,
  mode          text not null default 'auto' check (mode in ('auto','on','off')),
  until         timestamptz,                                       -- mode 'on' only: when the manual start ends
  reason        text check (char_length(reason) <= 500),
  set_by        uuid references public.profiles(id) on delete set null,
  set_at        timestamptz,
  recorded      text not null default 'on' check (recorded in ('on','off')),
  recorded_at   timestamptz,
  check (mode = 'on' or until is null),
  check (mode <> 'off' or reason is not null)
);

-- Access history: every effective change (stopped / restored, with the new state) and every change of the
-- manual setting (mode_off / mode_on / mode_auto). actor is null for the hourly job.
create table public.access_events (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  kind          text not null check (kind in ('stopped','restored','mode_off','mode_on','mode_auto')),
  state         text,
  reason        text check (char_length(reason) <= 500),
  until         timestamptz,
  actor         uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default clock_timestamp()
);
create index access_events_enrollment on public.access_events (enrollment_id, created_at);

-- Who did what, to what, when. Written by every admin function that changes something; read by admins only.
create table public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text not null,                                        -- kept if the account is later deleted
  action      text not null,
  target_type text not null,
  target_id   text,
  person_id   uuid references public.profiles(id) on delete set null,   -- the student or staff member concerned
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default clock_timestamp()
);
create index admin_audit_created on public.admin_audit (created_at desc);
create index admin_audit_person on public.admin_audit (person_id, created_at desc);

alter table public.payments          enable row level security;
alter table public.enrollment_access enable row level security;
alter table public.access_events     enable row level security;
alter table public.admin_audit       enable row level security;
-- No policies: read and written only through the functions below.
revoke all on public.payments, public.enrollment_access, public.access_events, public.admin_audit from anon, authenticated;
grant all on public.payments, public.enrollment_access, public.access_events, public.admin_audit to service_role;

-- ============================================================================
-- The access rule
-- ============================================================================
-- THE rule, with every fact passed in so it can be checked at exact instants. States:
-- closed (status), stopped_manual, started_manual, paid, grace, stopped_unpaid.
create function public.access_rule(p_status text, p_mode text, p_until timestamptz, p_paid boolean,
                                   p_grace_start timestamptz, p_at timestamptz) returns text
language sql stable as $$
  select case
    when p_status is null or p_status not in ('active','completed') then 'closed'
    when p_mode = 'off' then 'stopped_manual'
    when p_mode = 'on' and (p_until is null or p_at < p_until) then 'started_manual'
    when p_paid then 'paid'
    when p_at < p_grace_start + interval '30 days' then 'grace'
    else 'stopped_unpaid' end
$$;

create type public.access_info as (
  enrollment_id uuid, state text, open boolean, mode text, until timestamptz, reason text, set_by uuid, set_at timestamptz,
  paid boolean, paid_usd numeric, tuition_usd numeric, grace_start timestamptz, grace_end timestamptz,
  ends_at timestamptz, days_left int
);

-- One enrollment's facts and state at p_at. Gates always pass now() (see access_open); admin views and the
-- job use now() too. ends_at: when access stops if nothing changes (null when nothing is due to stop).
create function public.access_of(p_enrollment uuid, p_at timestamptz) returns public.access_info
language sql stable security definer set search_path = public, pg_temp as $$
  select f.id, f.state, f.state in ('paid','grace','started_manual'), f.mode, f.until, f.reason, f.set_by, f.set_at,
         f.paid, f.paid_usd, f.tuition, f.grace_start, f.grace_start + interval '30 days', f.ends_at,
         case when f.ends_at is not null then greatest(0, ceil(extract(epoch from (f.ends_at - p_at)) / 86400))::int end
  from (
    select x.*, case when x.state = 'grace' then x.grace_start + interval '30 days'
                     when x.state = 'started_manual' and x.until is not null and not x.paid
                       then greatest(x.until, x.grace_start + interval '30 days') end as ends_at
    from (
      select e.id, coalesce(a.mode, 'auto') as mode, a.until, a.reason, a.set_by, a.set_at,
             p.n > 0 as paid, coalesce(p.total, 0) as paid_usd, pr.tuition_per_term_usd as tuition, g.start as grace_start,
             public.access_rule(e.status, coalesce(a.mode, 'auto'), a.until, p.n > 0, g.start, p_at) as state
      from public.enrollments e
      join public.batches b on b.id = e.batch_id
      join public.programs pr on pr.id = e.program_id
      left join public.enrollment_access a on a.enrollment_id = e.id
      cross join lateral (select greatest(b.starts_on::timestamp at time zone b.timezone, e.enrolled_at) as start) g
      cross join lateral (select count(*) as n, sum(amount_usd) as total from public.payments
                          where enrollment_id = e.id and voided_at is null) p
      where e.id = p_enrollment) x) f
$$;

-- The gate used everywhere a student's access is checked, by the database clock only. A completed term also
-- needs the program's current (active) term to be open: a stopped student loses review of earlier terms too.
create function public.access_open(e public.enrollments) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(e.status in ('active','completed')
    and (public.access_of(e.id, now())).open
    and (e.status = 'active' or not exists (
          select 1 from public.enrollments x
          where x.student_id = e.student_id and x.program_id = e.program_id and x.status = 'active'
            and not (public.access_of(x.id, now())).open)), false)
$$;

create function public.person_name(p_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(full_name, ''), email) from public.profiles where id = p_id
$$;

-- An enrollment's access as admins see it.
create function public.access_json(x public.access_info) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'enrollment_id', x.enrollment_id, 'state', x.state, 'open', x.open,
    'mode', x.mode, 'until', x.until, 'reason', x.reason, 'set_by', public.person_name(x.set_by), 'set_at', x.set_at,
    'paid', x.paid, 'paid_usd', x.paid_usd, 'tuition_usd', x.tuition_usd,
    'grace_started_at', x.grace_start, 'grace_ends_at', x.grace_end, 'ends_at', x.ends_at, 'days_left', x.days_left)
$$;

-- Write one audit entry for the calling admin.
create function public.audit(p_action text, p_target_type text, p_target_id text, p_person uuid, p_details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.admin_audit (actor_id, actor_email, action, target_type, target_id, person_id, details)
  values (auth.uid(), coalesce((select email from public.profiles where id = auth.uid()), 'system'),
          p_action, p_target_type, p_target_id, p_person, jsonb_strip_nulls(coalesce(p_details, '{}'::jsonb)))
$$;

-- Compare an active enrollment's access with the last recorded state. On a change, record it in the access
-- history and notify: the student always; every admin too when access stopped for non-payment. Each change is
-- announced once (the row lock serialises the job and admin actions). p_actor: the admin whose action caused
-- it, or null for the job. Returns 'stopped', 'restored' or null.
create function public.sync_access(p_enrollment uuid, p_actor uuid default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e    public.enrollments;
  b    public.batches;
  x    public.access_info;
  rec  text;
  ev   uuid;
  who  text;
  prog text;
begin
  select * into e from public.enrollments where id = p_enrollment;
  if not found or e.status <> 'active' then return null; end if;
  insert into public.enrollment_access (enrollment_id) values (e.id) on conflict (enrollment_id) do nothing;
  select recorded into rec from public.enrollment_access where enrollment_id = e.id for update;
  x := public.access_of(e.id, now());
  if x.open = (rec = 'on') then return null; end if;

  update public.enrollment_access set recorded = case when x.open then 'on' else 'off' end, recorded_at = now()
   where enrollment_id = e.id;
  insert into public.access_events (enrollment_id, kind, state, actor)
  values (e.id, case when x.open then 'restored' else 'stopped' end, x.state, p_actor)
  returning id into ev;

  select * into b from public.batches where id = e.batch_id;
  select name into prog from public.programs where id = e.program_id;
  if x.open then
    insert into public.notifications (user_id, kind, ref_id, title, body)
    values (e.student_id, 'access_restored', ev, 'Your portal access is open again',
            'Your lessons, PDFs, live classes, projects and recordings for ' || prog || ' are available again.');
    return 'restored';
  end if;

  insert into public.notifications (user_id, kind, ref_id, title, body)
  values (e.student_id, 'access_stopped', ev, 'Your portal access is paused',
          case when x.state = 'stopped_unpaid'
               then 'Term ' || b.term_no || ' of ' || prog || ' has not been paid, so your lessons, PDFs, live classes, projects and recordings are paused. They open again as soon as your payment is recorded.'
               else 'Nuvora has paused your access to ' || prog || '. Please contact Nuvora if you have any questions.' end);
  if x.state = 'stopped_unpaid' then
    select coalesce(nullif(full_name, ''), email) || ' (' || email || ')' into who from public.profiles where id = e.student_id;
    insert into public.notifications (user_id, kind, ref_id, title, body)
    select p.id, 'access_stopped', ev, 'Access stopped: ' || public.person_name(e.student_id),
           who || ', ' || b.code || ': term ' || b.term_no || ' is unpaid 30 days after its access period began. Access stopped automatically; recording the payment restores it.'
    from public.profiles p where p.role = 'admin'
    on conflict (user_id, kind, ref_id) do nothing;
  end if;
  return 'stopped';
end $$;

-- ============================================================================
-- The hourly job (service role and scheduler only)
-- ============================================================================
-- 1. Manual starts whose end date has passed return to the automatic rule.
-- 2. Every opening and closing since the last run is recorded and announced (sync_access).
-- 3. Reminders 7 days and 1 day before access stops (only the 1-day one when less than a day is left), once
--    per end date: a new end date (for example after a manual start) gets its own reminders.
-- Safe to run any number of times: a second run changes and sends nothing.
create function public.apply_access_rules() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r        record;
  res      text;
  ended    int;
  stopped  int := 0;
  restored int := 0;
  d7       int;
  d1       int;
begin
  with done as (
    update public.enrollment_access set mode = 'auto', until = null, reason = null, set_by = null, set_at = now()
     where mode = 'on' and until <= now()
    returning enrollment_id)
  insert into public.access_events (enrollment_id, kind, reason)
  select enrollment_id, 'mode_auto', 'Manual start ended' from done;
  get diagnostics ended = row_count;

  for r in select e.id from public.enrollments e left join public.enrollment_access a on a.enrollment_id = e.id
           where e.status = 'active' and public.access_open(e) <> (coalesce(a.recorded, 'on') = 'on')
           order by e.enrolled_at, e.id loop
    res := public.sync_access(r.id, null);
    if res = 'stopped' then stopped := stopped + 1; elsif res = 'restored' then restored := restored + 1; end if;
  end loop;

  for r in select 1 as n, interval '1 day' as lo, interval '0' as hi, 'access_reminder_1d' as kind
           union all select 7, interval '7 days', interval '1 day', 'access_reminder_7d' loop
    insert into public.notifications (user_id, kind, ref_id, title, body)
    select e.student_id, r.kind, md5(e.id::text || '/' || extract(epoch from x.ends_at)::text)::uuid,
           'Tuition reminder: your access pauses on ' || to_char(x.ends_at at time zone b.timezone, 'FMMon FMDD'),
           'Term ' || b.term_no || ' of ' || pr.name || ' has not been paid yet. Your portal access continues until '
             || to_char(x.ends_at at time zone b.timezone, 'Dy Mon DD, HH24:MI') || ' (' || b.timezone || ')'
             || ' and then pauses until your payment is recorded. If you have already paid, please let Nuvora know so it can be recorded.'
    from public.enrollments e
    join public.batches b on b.id = e.batch_id
    join public.programs pr on pr.id = e.program_id
    cross join lateral public.access_of(e.id, now()) x
    where e.status = 'active' and x.open and x.ends_at is not null
      and x.ends_at <= now() + r.lo and x.ends_at > now() + r.hi
    on conflict (user_id, kind, ref_id) do nothing;
    if r.n = 1 then get diagnostics d1 = row_count; else get diagnostics d7 = row_count; end if;
  end loop;

  return jsonb_build_object('starts_ended', ended, 'stopped', stopped, 'restored', restored, 'reminders_7d', d7, 'reminders_1d', d1);
end $$;

-- ============================================================================
-- The rule applied everywhere student access is checked
-- ============================================================================
create or replace function public.my_active_batches() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select e.batch_id from public.enrollments e
  where e.student_id = auth.uid() and e.status = 'active' and public.access_open(e)
$$;

-- Batches, their classes, projects and staff (row security), and every portal page through portal_batch().
create or replace function public.can_see_batch(p_batch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or public.teaches(p_batch)
      or exists (select 1 from public.enrollments e
                 where e.student_id = auth.uid() and e.batch_id = p_batch and e.status = 'active' and public.access_open(e))
$$;

-- Lessons, progress tracking, the course page and the learning path.
create or replace function public.term_open(p_student uuid, p_program text, p_term int) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_student is not null and exists (
    select 1 from public.enrollments e join public.batches b on b.id = e.batch_id
    where e.student_id = p_student and e.program_id = p_program and b.term_no = p_term
      and e.status in ('active','completed') and public.access_open(e))
$$;

-- PDF downloads (the storage rule).
create or replace function public.can_read_material(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.materials mt
    where mt.file_path = p_path
      and (public.is_admin()
           or exists (select 1 from public.enrollments e join public.batches b on b.id = e.batch_id
                      where e.student_id = auth.uid() and e.program_id = mt.program_id
                        and e.status in ('active','completed')
                        and b.term_no = coalesce(public.material_term(mt.lesson_id, mt.assignment_template_id), b.term_no)
                        and public.access_open(e))
           or exists (select 1 from public.batch_staff s join public.batches b on b.id = s.batch_id
                      where s.user_id = auth.uid() and b.program_id = mt.program_id)))
$$;

-- The portal shell: open batches only, plus each active enrollment's access state ('access'), so the portal
-- can explain a pause. The state uses the database clock; p_now only shapes what the batches display.
create or replace function public.my_dashboard(p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'profile', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role)
                from public.profiles p where p.id = uid),
    'batches', coalesce((
      select jsonb_agg(public.batch_summary_json(b, uid, p_now) order by b.starts_on)
      from public.enrollments e
      join public.batches b on b.id = e.batch_id
      where e.student_id = uid and e.status = 'active' and public.access_open(e)), '[]'::jsonb),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object('enrollment_id', e.id, 'batch_id', b.id, 'code', b.code, 'program_id', b.program_id,
                                          'program', pr.name, 'term', b.term_no, 'state', x.state, 'open', x.open, 'paid', x.paid,
                                          'ends_at', x.ends_at, 'days_left', x.days_left) order by b.starts_on, b.code)
      from public.enrollments e
      join public.batches b on b.id = e.batch_id
      join public.programs pr on pr.id = b.program_id
      cross join lateral public.access_of(e.id, now()) x
      where e.student_id = uid and e.status = 'active'), '[]'::jsonb),
    'reserved', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'code', b.code, 'program', pr.name, 'term', b.term_no,
                                          'term_title', t.title, 'starts_on', b.starts_on) order by b.starts_on)
      from public.enrollments e
      join public.batches b on b.id = e.batch_id
      join public.programs pr on pr.id = b.program_id
      join public.program_terms t on t.program_id = b.program_id and t.term_no = b.term_no
      where e.student_id = uid and e.status = 'reserved'), '[]'::jsonb),
    'continue_watching', coalesce((select jsonb_agg(jsonb_build_object(
        'lesson_id', l.id, 'code', l.code, 'title', l.title, 'last_position', lp.last_position,
        'duration', l.duration_seconds, 'percent', round(100.0 * lp.watched_seconds / nullif(l.duration_seconds, 0))) order by lp.updated_at desc)
      from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
      join public.modules m on m.id = l.module_id
      where lp.student_id = uid and lp.completed_at is null and lp.watched_seconds > 0
        and public.term_open(uid, m.program_id, m.term_no)), '[]'::jsonb),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = uid and n.read_at is null)
  ) into result;
  return result;
end $$;

-- Submissions: only to a batch the student is in, while their access is open.
create or replace function public.submit_assignment(p_assignment uuid, p_link text default null, p_file text default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  bid uuid;
  e   public.enrollments;
  s   public.submissions;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if coalesce(nullif(trim(p_link), ''), nullif(trim(p_file), '')) is null then
    raise exception 'Add a link or a file' using errcode = '22023';
  end if;
  if p_link is not null and p_link !~* '^https://' then
    raise exception 'Links must start with https://' using errcode = '22023';
  end if;
  if char_length(p_link) > 500 or char_length(p_file) > 500 or char_length(p_note) > 2000 then
    raise exception 'Links are limited to 500 characters and notes to 2000' using errcode = '22001';
  end if;

  select batch_id into bid from public.batch_assignments where id = p_assignment;
  select * into e from public.enrollments where student_id = uid and batch_id = bid and status = 'active';
  if bid is null or e.id is null then
    raise exception 'This assignment is not part of your batch' using errcode = '42501';
  end if;
  if not public.access_open(e) then
    raise exception 'Your portal access to this program is paused' using errcode = '42501';
  end if;

  select * into s from public.submissions where assignment_id = p_assignment and student_id = uid for update;
  if found then
    if s.status = 'graded' then raise exception 'Already passed; no resubmission needed' using errcode = '22023'; end if;
    update public.submissions
       set attempt = s.attempt + 1, status = 'submitted', link_url = nullif(trim(p_link), ''),
           file_path = nullif(trim(p_file), ''), note = p_note, submitted_at = now(), grade = null, graded_at = null, graded_by = null
     where id = s.id;
    update public.profiles set last_active_at = now() where id = uid;
    return s.id;
  end if;

  insert into public.submissions (assignment_id, student_id, link_url, file_path, note)
  values (p_assignment, uid, nullif(trim(p_link), ''), nullif(trim(p_file), ''), p_note)
  returning id into s.id;
  update public.profiles set last_active_at = now() where id = uid;
  return s.id;
end $$;

-- Class reminders and "recording ready" go only to students who can open the batch.
create or replace function public.queue_session_reminders(p_hours int default 24, p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  insert into public.notifications (user_id, kind, ref_id, title, body)
  select e.student_id, 'reminder_' || p_hours || 'h', s.id,
         'Live class soon: ' || s.title,
         'Starts ' || to_char(s.starts_at at time zone b.timezone, 'Dy Mon DD, HH24:MI') || ' (' || b.timezone || ').'
  from public.sessions s
  join public.batches b on b.id = s.batch_id
  join public.enrollments e on e.batch_id = s.batch_id and e.status = 'active'
  where s.status = 'scheduled' and s.starts_at > p_now and s.starts_at <= p_now + make_interval(hours => p_hours)
    and public.access_open(e)
  on conflict (user_id, kind, ref_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.attach_recording(p_session uuid, p_asset text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare bid uuid; t text; n int;
begin
  update public.sessions set recording_asset_id = p_asset, status = 'ended'
   where id = p_session returning batch_id, title into bid, t;
  if bid is null then raise exception 'Unknown session' using errcode = 'P0002'; end if;
  insert into public.notifications (user_id, kind, ref_id, title, body)
  select e.student_id, 'recording', p_session, 'Recording ready: ' || t, 'Watch it any time in your batch.'
  from public.enrollments e where e.batch_id = bid and e.status = 'active' and public.access_open(e)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================================
-- Seat requests: one answer for every accepted request (owner decision, 2026-10-03)
-- ============================================================================
-- request_seat() keeps every check of 20261002000006_seat_requests.sql, but an accepted request, new or a
-- repeat, always returns {"ok": true}: no reference and no sign of an earlier request. Over the daily limit
-- of 5 new requests per email the request is quietly not stored (an error would reveal the earlier ones).
create or replace function public.request_seat(
  p_program         text,
  p_start           date,
  p_full_name       text,
  p_email           text,
  p_country         text,
  p_consent         boolean,
  p_consent_version text,
  p_phone           text default null,
  p_details         jsonb default '{}'::jsonb,
  p_source          text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today     date := (now() at time zone 'Asia/Kolkata')::date;
  prog      public.programs;
  problem   text;
  v_name    text;
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_country text := regexp_replace(trim(coalesce(p_country, '')), '\s+', ' ', 'g');
  v_phone   text := nullif(trim(coalesce(p_phone, '')), '');
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_source  text := nullif(trim(coalesce(p_source, '')), '');
  v_version text := trim(coalesce(p_consent_version, ''));
  ref       text;
  tries     int := 0;
begin
  select * into prog from public.programs where id = p_program and active;
  if not found then raise exception 'Please choose one of our programs.' using errcode = '22023'; end if;

  problem := public.seat_start_problem(p_start, today);
  if problem is not null then raise exception '%', problem using errcode = '22023'; end if;

  if coalesce(p_full_name, '') ~ '[[:cntrl:]]' then
    raise exception 'Please enter your full name (2 to 80 characters).' using errcode = '22023';
  end if;
  v_name := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Please enter your full name (2 to 80 characters).' using errcode = '22023';
  end if;

  if char_length(v_email) > 254 or char_length(split_part(v_email, '@', 1)) > 64
     or v_email !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;

  if coalesce(p_country, '') ~ '[[:cntrl:]]' or char_length(v_country) not between 2 and 56 then
    raise exception 'Please enter your country.' using errcode = '22023';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9 +()-]{6,24}$' then
    raise exception 'Please enter a phone number of 6 to 24 digits, spaces and + - ( ), or leave it empty.' using errcode = '22023';
  end if;

  if p_consent is not true then
    raise exception 'Please agree to be contacted about your seat request.' using errcode = '22023';
  end if;
  if v_version = '' or char_length(v_version) > 40 or v_version ~ '[[:cntrl:]]' then
    raise exception 'This form is out of date. Please reload the page and try again.' using errcode = '22023';
  end if;

  -- Optional answers from the website's program finder: known keys only, each a short scalar.
  if jsonb_typeof(v_details) <> 'object'
     or char_length(v_details::text) > 1000
     or exists (select 1 from jsonb_each(v_details) d
                where d.key not in ('role','goal','hours','coding','has_bachelor','match','score')
                   or jsonb_typeof(d.value) not in ('string','number','boolean','null')
                   or char_length(d.value #>> '{}') > 200) then
    raise exception 'Some of your answers could not be saved. Please reload the page and try again.' using errcode = '22023';
  end if;
  if char_length(v_source) > 200 then
    raise exception 'This form is out of date. Please reload the page and try again.' using errcode = '22023';
  end if;

  -- One request at a time per email, so the duplicate check and the daily limit are exact.
  perform pg_advisory_xact_lock(hashtext('seat_request:' || v_email));

  -- A repeat (same email, program and start within 30 days) stores nothing and answers like a new request.
  perform 1 from public.seat_requests
   where email = v_email and program_id = prog.id and start_date = p_start and created_at > now() - interval '30 days';
  if found then return jsonb_build_object('ok', true); end if;

  if (select count(*) from public.seat_requests where email = v_email and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', true);
  end if;

  loop
    ref := public.seat_reference();
    begin
      insert into public.seat_requests (reference, program_id, start_date, full_name, email, phone, country, details, source, consent_version)
      values (ref, prog.id, p_start, v_name, v_email, v_phone, v_country, v_details, v_source, v_version);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 5 then raise; end if;
    end;
  end loop;

  return jsonb_build_object('ok', true);
end $$;

-- Admins see the reference, and whether the person already has an account (so the request can be converted).
create or replace function public.seat_request_json(r public.seat_requests) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'program', r.program_id,
    'program_name', (select name from public.programs where id = r.program_id),
    'start_date', r.start_date, 'apply_by', r.start_date - 7,
    'full_name', r.full_name, 'email', r.email, 'phone', r.phone, 'country', r.country,
    'details', r.details, 'source', r.source, 'consent_version', r.consent_version, 'consented_at', r.consented_at,
    'status', r.status, 'notes', r.notes,
    'handled_by', (select coalesce(nullif(full_name, ''), email) from public.profiles where id = r.handled_by),
    'account_id', (select id from public.profiles where lower(email) = r.email order by created_at limit 1),
    'created_at', r.created_at, 'updated_at', r.updated_at)
$$;

-- ============================================================================
-- Admin functions that existed before: unchanged rules, now written to the audit log
-- ============================================================================
create or replace function public.admin_create_batch(p_program text, p_starts_on date, p_term int default 1) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare bid uuid;
begin
  perform public.require_admin();
  bid := public.create_batch(p_program, p_starts_on, p_term);
  perform public.audit('batch.create', 'batch', bid::text, null,
    jsonb_build_object('code', (select code from public.batches where id = bid), 'program', p_program, 'starts_on', p_starts_on, 'term', p_term));
  return bid;
end $$;

create or replace function public.admin_enroll(p_email text, p_program text, p_starts_on date default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid; eid uuid;
begin
  perform public.require_admin();
  select id into sid from public.profiles where lower(email) = lower(p_email);
  if sid is null then raise exception 'No account with email %', p_email using errcode = 'P0002'; end if;
  eid := public.enroll_student(sid, p_program, p_starts_on, 'admin', null);
  perform public.audit('enrollment.create', 'enrollment', eid::text, sid,
    jsonb_build_object('program', p_program, 'batch', (select b.code from public.enrollments e join public.batches b on b.id = e.batch_id where e.id = eid)));
  perform public.sync_access(eid, auth.uid());
  return eid;
end $$;

-- Move a student to another batch of the same program and term; access switches immediately.
create or replace function public.admin_transfer(p_enrollment uuid, p_new_batch uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.enrollments; nb public.batches;
begin
  perform public.require_admin();
  select * into e from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
  select * into nb from public.batches where id = p_new_batch;
  if not found or nb.program_id <> e.program_id
     or nb.term_no <> (select term_no from public.batches where id = e.batch_id) then
    raise exception 'Target batch must belong to the same program and term' using errcode = '22023';
  end if;
  if exists (select 1 from public.enrollments where student_id = e.student_id and batch_id = p_new_batch) then
    raise exception 'Student already has an enrollment in that batch' using errcode = '23505';
  end if;
  update public.enrollments set batch_id = p_new_batch, source = 'transfer', status = 'active', updated_at = now()
   where id = p_enrollment;
  perform public.audit('enrollment.transfer', 'enrollment', e.id::text, e.student_id,
    jsonb_build_object('from', (select code from public.batches where id = e.batch_id), 'to', nb.code));
  perform public.sync_access(e.id, auth.uid());
end $$;

-- Admins activate reserved seats, pause, withdraw, or mark a term completed.
create or replace function public.admin_set_enrollment_status(p_enrollment uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare old public.enrollments;
begin
  perform public.require_admin();
  if p_status not in ('active','reserved','paused','completed','withdrawn') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  select * into old from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
  begin
    update public.enrollments set status = p_status, updated_at = now() where id = p_enrollment;
  exception when unique_violation then
    raise exception 'This student already has an active enrollment in that program' using errcode = '23505';
  end;
  perform public.audit('enrollment.status', 'enrollment', old.id::text, old.student_id,
    jsonb_build_object('from', old.status, 'to', p_status, 'batch', (select code from public.batches where id = old.batch_id)));
  perform public.sync_access(old.id, auth.uid());
end $$;

-- Change a person's role. The last admin cannot be demoted, and someone made a student stops teaching.
create function public.change_role(p_user uuid, p_role text) returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.profiles; was text; removed text[];
begin
  if p_role is null or p_role not in ('student','instructor','admin') then raise exception 'Invalid role' using errcode = '22023'; end if;
  perform 1 from public.profiles where role = 'admin' for update;        -- two admins demoting each other: one at a time
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'Unknown user' using errcode = 'P0002'; end if;
  was := p.role;
  if was = 'admin' and p_role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'At least one admin must remain' using errcode = '22023';
  end if;
  if p_role = 'student' then
    with gone as (delete from public.batch_staff s where s.user_id = p.id returning s.batch_id)
    select array_agg(b.code order by b.code) into removed from gone join public.batches b on b.id = gone.batch_id;
  end if;
  update public.profiles set role = p_role where id = p.id returning * into p;
  perform public.audit('user.role', 'user', p.id::text, p.id,
    jsonb_build_object('email', p.email, 'from', was, 'to', p_role, 'removed_from_batches', removed));
  return p;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  perform public.change_role(p_user, p_role);
end $$;

create or replace function public.admin_assign_staff(p_batch uuid, p_user uuid, p_role text default 'instructor') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r text; code text;
begin
  perform public.require_admin();
  select b.code into code from public.batches b where b.id = p_batch;
  if code is null then raise exception 'Unknown batch' using errcode = 'P0002'; end if;
  select role into r from public.profiles where id = p_user;
  if r is null then raise exception 'Unknown user' using errcode = 'P0002'; end if;
  if r not in ('instructor','admin') then raise exception 'Make this person an instructor first' using errcode = '22023'; end if;
  if p_role is null or p_role not in ('instructor','mentor','coach') then
    raise exception 'Invalid staff role %', p_role using errcode = '22023';
  end if;
  insert into public.batch_staff (batch_id, user_id, role) values (p_batch, p_user, p_role)
  on conflict (batch_id, user_id) do update set role = excluded.role;
  perform public.audit('staff.assign', 'batch', p_batch::text, p_user, jsonb_build_object('batch', code, 'role', p_role));
end $$;

create or replace function public.admin_update_seat_request(p_id uuid, p_status text, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.seat_requests; was text;
begin
  perform public.require_admin();
  if p_status is null or p_status not in ('new','contacted','converted','closed') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  if char_length(p_notes) > 2000 then
    raise exception 'Notes are limited to 2000 characters' using errcode = '22001';
  end if;
  select status into was from public.seat_requests where id = p_id;
  update public.seat_requests
     set status = p_status, notes = coalesce(p_notes, notes), handled_by = auth.uid(), updated_at = now()
   where id = p_id
  returning * into r;
  if not found then raise exception 'Unknown seat request' using errcode = 'P0002'; end if;
  perform public.audit('seat_request.update', 'seat_request', r.id::text,
    (select id from public.profiles where lower(email) = r.email order by created_at limit 1),
    jsonb_build_object('reference', r.reference, 'from', was, 'to', p_status, 'notes_changed', p_notes is not null));
  return public.seat_request_json(r);
end $$;

-- ============================================================================
-- Admin: dashboard, students database, one student
-- ============================================================================
create function public.admin_overview() returns jsonb
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
    'grace', coalesce((select jsonb_agg(j order by ends_at, lower(full_name), eid)
                       from (select * from item where state = 'grace' order by ends_at, lower(full_name), eid limit 50) g), '[]'::jsonb),
    'stopped', coalesce((select jsonb_agg(j order by coalesce(since, grace_end) desc, lower(full_name), eid)
                         from (select * from item where state in ('stopped_unpaid','stopped_manual')
                               order by coalesce(since, grace_end) desc, lower(full_name), eid limit 50) s), '[]'::jsonb))
  into result;
  return result;
end $$;

-- One row per student and program (the current enrollment in it), or per enrollment of one batch.
create function public.admin_students(
  p_search  text default null,
  p_program text default null,
  p_batch   uuid default null,
  p_status  text default null,
  p_payment text default null,
  p_access  text default null,
  p_sort    text default 'name',
  p_desc    boolean default false,
  p_limit   int default 50,
  p_offset  int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  q      text := nullif(trim(coalesce(p_search, '')), '');
  pat    text;
  srt    text := coalesce(p_sort, 'name');
  dsc    boolean := coalesce(p_desc, false);
  result jsonb;
begin
  perform public.require_admin();
  if char_length(q) > 100 then raise exception 'Search for at most 100 characters' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('active','reserved','paused','completed','withdrawn','none') then
    raise exception 'Invalid status filter %', p_status using errcode = '22023';
  end if;
  if p_payment is not null and p_payment not in ('paid','unpaid') then
    raise exception 'Invalid payment filter %', p_payment using errcode = '22023';
  end if;
  if p_access is not null and p_access not in ('paid','grace','stopped_unpaid','stopped_manual','started_manual','closed','open','stopped','ending_soon') then
    raise exception 'Invalid access filter %', p_access using errcode = '22023';
  end if;
  if srt not in ('name','email','last_active','enrolled_at','days_left','program','batch','signed_up') then
    raise exception 'Invalid sort %', srt using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'Limit must be between 1 and 200' using errcode = '22023'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Offset must be 0 or more' using errcode = '22023'; end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with people as (
    select p.* from public.profiles p
    where p.role = 'student' or exists (select 1 from public.enrollments e where e.student_id = p.id)),
  cur as (
    select distinct on (e.student_id, e.program_id) e.*
    from public.enrollments e join public.batches b on b.id = e.batch_id
    where p_batch is null or e.batch_id = p_batch
    order by e.student_id, e.program_id,
             case e.status when 'active' then 0 when 'reserved' then 1 when 'paused' then 2 when 'completed' then 3 else 4 end,
             b.term_no desc, b.starts_on desc),
  r as (
    select p.id as sid, p.full_name, p.email, p.role, p.created_at as signed_up_at, p.last_active_at,
           c.id as eid, c.status, c.enrolled_at, c.program_id, pr.name as program, b.id as batch_id, b.code, b.term_no,
           b.starts_on, b.ends_on, x
    from people p
    left join cur c on c.student_id = p.id
    left join public.batches b on b.id = c.batch_id
    left join public.programs pr on pr.id = c.program_id
    left join lateral public.access_of(c.id, now()) x on c.id is not null
    where (p_batch is null or c.id is not null)
      and (q is null or p.full_name ilike pat or p.email ilike pat)
      and (p_program is null or c.program_id = p_program)
      and (p_status is null or (p_status = 'none' and c.id is null) or c.status = p_status)
      and (p_payment is null or (c.id is not null and (x).paid = (p_payment = 'paid')))
      and (p_access is null or (c.id is not null and ((x).state = p_access or (p_access = 'open' and (x).open)
                                                    or (p_access = 'stopped' and (x).state in ('stopped_unpaid','stopped_manual'))
                                                    -- the overview's "pausing within 7 days": active and open, stopping in 7 days or less
                                                    or (p_access = 'ending_soon' and c.status = 'active' and (x).open
                                                        and (x).ends_at <= now() + interval '7 days'))))),
  k as (
    select r.*,
           case srt when 'name' then lower(coalesce(nullif(full_name, ''), email)) when 'email' then email
                    when 'program' then program when 'batch' then code end as kt,
           case srt when 'last_active' then last_active_at when 'enrolled_at' then enrolled_at when 'signed_up' then signed_up_at end as kts,
           case when srt = 'days_left' then (x).days_left end as kn
    from r),
  page as (
    select k.*, row_number() over (order by
             case when not dsc then kt end asc nulls last, case when dsc then kt end desc nulls last,
             case when not dsc then kts end asc nulls last, case when dsc then kts end desc nulls last,
             case when not dsc then kn end asc nulls last, case when dsc then kn end desc nulls last,
             lower(full_name), email, program_id, eid) as n
    from k)
  select jsonb_build_object(
    'total', (select count(*) from r), 'limit', p_limit, 'offset', p_offset,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'student_id', sid, 'name', full_name, 'email', email, 'role', role,
        'signed_up_at', signed_up_at, 'last_active_at', last_active_at,
        'enrollment_id', eid, 'enrollment_status', status, 'enrolled_at', enrolled_at,
        'program_id', program_id, 'program', program, 'batch_id', batch_id, 'batch_code', code, 'term', term_no,
        'terms', (select count(*) from public.program_terms t where t.program_id = page.program_id),
        'term_title', (select title from public.program_terms t where t.program_id = page.program_id and t.term_no = page.term_no),
        'starts_on', starts_on, 'ends_on', ends_on,
        'payment', case when eid is null then null when (x).paid then 'paid' else 'unpaid' end,
        'access', case when eid is not null then public.access_json(x) end) order by n)
      from page where n > p_offset and n <= p_offset + p_limit), '[]'::jsonb))
  into result;
  return result;
end $$;

create function public.payment_json(p public.payments) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id, 'enrollment_id', p.enrollment_id, 'amount_usd', p.amount_usd, 'method', p.method, 'reference', p.reference,
    'note', p.note, 'paid_on', p.paid_on, 'source', p.source,
    'recorded_by', public.person_name(p.recorded_by), 'recorded_at', p.recorded_at,
    'voided', p.voided_at is not null, 'voided_at', p.voided_at, 'voided_by', public.person_name(p.voided_by), 'void_reason', p.void_reason)
$$;

create function public.audit_json(a public.admin_audit) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', a.id, 'created_at', a.created_at, 'actor_id', a.actor_id, 'actor', public.person_name(a.actor_id), 'actor_email', a.actor_email,
    'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
    'person_id', a.person_id, 'person', public.person_name(a.person_id), 'details', a.details)
$$;

create function public.admin_student(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  perform public.require_admin();
  select * into p from public.profiles where id = p_student;
  if not found then raise exception 'Unknown student' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role,
                                  'signed_up_at', p.created_at, 'last_active_at', p.last_active_at, 'goal_role', p.goal_role),
    'enrollments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'program_id', e.program_id, 'program', pr.name, 'status', e.status, 'source', e.source,
        'enrolled_at', e.enrolled_at, 'updated_at', e.updated_at,
        'batch', jsonb_build_object('id', b.id, 'code', b.code, 'term', b.term_no,
                                    'term_title', (select title from public.program_terms t where t.program_id = b.program_id and t.term_no = b.term_no),
                                    'starts_on', b.starts_on, 'ends_on', b.ends_on, 'status', b.status),
        'access', public.access_json(public.access_of(e.id, now())),
        'payments', coalesce((select jsonb_agg(public.payment_json(y) order by y.recorded_at desc, y.id)
                              from public.payments y where y.enrollment_id = e.id), '[]'::jsonb))
        order by b.starts_on desc, b.term_no desc, e.id)
      from public.enrollments e
      join public.batches b on b.id = e.batch_id
      join public.programs pr on pr.id = e.program_id
      where e.student_id = p.id), '[]'::jsonb),
    'access_history', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'enrollment_id', v.enrollment_id, 'batch_code', v.code, 'kind', v.kind,
                                          'state', v.state, 'reason', v.reason, 'until', v.until,
                                          'actor', public.person_name(v.actor), 'created_at', v.created_at)
                       order by v.created_at desc, v.id)
      from (select ev.*, b.code from public.access_events ev
            join public.enrollments e on e.id = ev.enrollment_id
            join public.batches b on b.id = e.batch_id
            where e.student_id = p.id order by ev.created_at desc, ev.id limit 200) v), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(public.audit_json(a) order by a.created_at desc, a.id)
      from (select * from public.admin_audit where person_id = p.id order by created_at desc, id limit 200) a), '[]'::jsonb),
    'seat_requests', coalesce((
      select jsonb_agg(public.seat_request_json(s) order by s.created_at desc, s.id)
      from public.seat_requests s where s.email = lower(p.email)), '[]'::jsonb));
end $$;

-- ============================================================================
-- Admin: access and payments
-- ============================================================================
create function public.admin_set_access(p_enrollment uuid, p_mode text, p_reason text default null, p_until timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e        public.enrollments;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.require_admin();
  select * into e from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
  if p_mode is null or p_mode not in ('auto','on','off') then
    raise exception 'Choose auto, on or off' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then raise exception 'Reasons are limited to 500 characters' using errcode = '22001'; end if;
  if p_mode = 'off' and v_reason is null then raise exception 'Give a reason for stopping access' using errcode = '22023'; end if;
  if p_until is not null and p_mode <> 'on' then
    raise exception 'An end date can only be set when starting access' using errcode = '22023';
  end if;
  if p_until <= now() then raise exception 'The end date must be in the future' using errcode = '22023'; end if;
  if p_until > now() + interval '366 days' then raise exception 'The end date can be at most a year ahead' using errcode = '22023'; end if;

  insert into public.enrollment_access (enrollment_id) values (e.id) on conflict (enrollment_id) do nothing;
  update public.enrollment_access
     set mode = p_mode, until = p_until, reason = case when p_mode = 'auto' then null else v_reason end,
         set_by = auth.uid(), set_at = now()
   where enrollment_id = e.id;
  insert into public.access_events (enrollment_id, kind, reason, until, actor)
  values (e.id, 'mode_' || p_mode, v_reason, p_until, auth.uid());
  perform public.audit('access.set', 'enrollment', e.id::text, e.student_id,
    jsonb_build_object('mode', p_mode, 'reason', v_reason, 'until', p_until, 'batch', (select code from public.batches where id = e.batch_id)));
  perform public.sync_access(e.id, auth.uid());
  return public.access_json(public.access_of(e.id, now()));
end $$;

create function public.admin_record_payment(
  p_enrollment uuid,
  p_amount_usd numeric,
  p_method     text,
  p_reference  text default null,
  p_note       text default null,
  p_paid_on    date default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e      public.enrollments;
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_ref  text := nullif(trim(coalesce(p_reference, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  pay    public.payments;
begin
  perform public.require_admin();
  select * into e from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
  if p_method is null or p_method not in ('bank_transfer','cash','waiver','other') then
    raise exception 'Choose a payment method: bank_transfer, cash, waiver or other' using errcode = '22023';
  end if;
  if p_amount_usd is null or p_amount_usd < 0 or p_amount_usd > 100000 or p_amount_usd <> round(p_amount_usd, 2)
     or (p_amount_usd = 0 and p_method <> 'waiver') then
    raise exception 'Enter an amount in US dollars above 0 and up to 100000, with at most 2 decimals (0 only for a waiver)' using errcode = '22023';
  end if;
  if char_length(v_ref) > 100 then raise exception 'References are limited to 100 characters' using errcode = '22001'; end if;
  if v_ref ~ '[[:cntrl:]]' then raise exception 'The reference contains characters that are not allowed' using errcode = '22023'; end if;
  if char_length(v_note) > 1000 then raise exception 'Notes are limited to 1000 characters' using errcode = '22001'; end if;
  if p_paid_on > today then raise exception 'The payment date cannot be in the future' using errcode = '22023'; end if;

  begin
    insert into public.payments (enrollment_id, amount_usd, method, reference, note, paid_on, recorded_by)
    values (e.id, p_amount_usd, p_method, v_ref, v_note, coalesce(p_paid_on, today), auth.uid())
    returning * into pay;
  exception when unique_violation then
    raise exception 'A payment with reference % is already recorded', v_ref using errcode = '23505';
  end;
  perform public.audit('payment.record', 'payment', pay.id::text, e.student_id,
    jsonb_build_object('enrollment_id', e.id, 'batch', (select code from public.batches where id = e.batch_id),
                       'amount_usd', pay.amount_usd, 'method', pay.method, 'reference', pay.reference, 'paid_on', pay.paid_on));
  perform public.sync_access(e.id, auth.uid());
  return jsonb_build_object('payment', public.payment_json(pay), 'access', public.access_json(public.access_of(e.id, now())));
end $$;

create function public.admin_void_payment(p_payment uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pay      public.payments;
  sid      uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.require_admin();
  select * into pay from public.payments where id = p_payment for update;
  if not found then raise exception 'Unknown payment' using errcode = 'P0002'; end if;
  if pay.voided_at is not null then raise exception 'This payment is already voided' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'Give a reason for voiding the payment' using errcode = '22023'; end if;
  if char_length(v_reason) > 500 then raise exception 'Reasons are limited to 500 characters' using errcode = '22001'; end if;
  update public.payments set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = pay.id returning * into pay;
  select student_id into sid from public.enrollments where id = pay.enrollment_id;
  perform public.audit('payment.void', 'payment', pay.id::text, sid,
    jsonb_build_object('enrollment_id', pay.enrollment_id, 'amount_usd', pay.amount_usd, 'reference', pay.reference, 'reason', v_reason));
  perform public.sync_access(pay.enrollment_id, auth.uid());
  return jsonb_build_object('payment', public.payment_json(pay), 'access', public.access_json(public.access_of(pay.enrollment_id, now())));
end $$;

-- ============================================================================
-- Admin: batches and staff
-- ============================================================================
create function public.admin_batch_json(b public.batches) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'program_id', b.program_id, 'program', (select name from public.programs where id = b.program_id),
    'term', b.term_no, 'term_title', (select title from public.program_terms where program_id = b.program_id and term_no = b.term_no),
    'starts_on', b.starts_on, 'ends_on', b.ends_on, 'status', b.status, 'timezone', b.timezone, 'capacity', b.capacity,
    'enrolled', (select jsonb_build_object('active', count(*) filter (where status = 'active'),
                                           'reserved', count(*) filter (where status = 'reserved'),
                                           'paused', count(*) filter (where status = 'paused'),
                                           'completed', count(*) filter (where status = 'completed'),
                                           'withdrawn', count(*) filter (where status = 'withdrawn'))
                 from public.enrollments where batch_id = b.id),
    'seats_taken', s.taken, 'seats_left', greatest(0, b.capacity - s.taken),
    'instructors', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'role', st.role)
                                              order by lower(p.full_name), p.email)
                             from public.batch_staff st join public.profiles p on p.id = st.user_id where st.batch_id = b.id), '[]'::jsonb),
    'sessions', (select jsonb_build_object('total', count(*),
                                           'upcoming', count(*) filter (where status not in ('cancelled','ended') and ends_at > now()),
                                           'upcoming_with_link', count(*) filter (where status not in ('cancelled','ended') and ends_at > now()
                                                                                    and join_url is not null))
                 from public.sessions where batch_id = b.id),
    'next_session', (select jsonb_build_object('id', x.id, 'title', x.title, 'starts_at', x.starts_at, 'join_url', x.join_url)
                     from public.sessions x where x.batch_id = b.id and x.status not in ('cancelled','ended') and x.ends_at > now()
                     order by x.starts_at limit 1))
  from (select count(*) as taken from public.enrollments where batch_id = b.id and status in ('active','reserved')) s
$$;

create function public.admin_batches(p_status text default null, p_program text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if p_status is not null and p_status not in ('all','scheduled','active','completed','cancelled') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(public.admin_batch_json(b) order by b.starts_on desc, b.code)
    from public.batches b
    where (p_program is null or b.program_id = p_program)
      and case when p_status is null then b.status in ('scheduled','active')
               when p_status = 'all' then true
               else b.status = p_status end), '[]'::jsonb);
end $$;

create function public.admin_update_batch(p_batch uuid, p_capacity int default null, p_status text default null, p_join_url text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b     public.batches;
  taken int;
  v_url text := trim(p_join_url);
  links int;
begin
  perform public.require_admin();
  select * into b from public.batches where id = p_batch for update;
  if not found then raise exception 'Unknown batch' using errcode = 'P0002'; end if;
  select count(*) into taken from public.enrollments where batch_id = b.id and status in ('active','reserved');
  if p_capacity is not null and p_capacity not between 1 and 500 then
    raise exception 'Capacity must be between 1 and 500' using errcode = '22023';
  end if;
  if p_capacity < taken then
    raise exception '% students already hold seats in this batch', taken using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('scheduled','active','completed','cancelled') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  if v_url <> '' and (v_url !~ '^https://[^[:space:][:cntrl:]]+$' or char_length(v_url) > 500) then
    raise exception 'Join links must start with https://, have no spaces and be at most 500 characters' using errcode = '22023';
  end if;

  update public.batches set capacity = coalesce(p_capacity, capacity), status = coalesce(p_status, status)
   where id = b.id;
  if v_url is not null then
    update public.sessions set join_url = nullif(v_url, '')
     where batch_id = b.id and status not in ('cancelled','ended') and ends_at > now();
    get diagnostics links = row_count;
  end if;
  perform public.audit('batch.update', 'batch', b.id::text, null, jsonb_build_object(
    'code', b.code,
    'capacity', case when p_capacity is not null then jsonb_build_object('from', b.capacity, 'to', p_capacity) end,
    'status', case when p_status is not null then jsonb_build_object('from', b.status, 'to', p_status) end,
    'join_link', case when v_url is not null then jsonb_build_object('sessions', links, 'removed', v_url = '') end));
  select * into b from public.batches where id = b.id;
  return public.admin_batch_json(b);
end $$;

create function public.admin_staff() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role,
      'batches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'role', s.role, 'status', b.status)
                                            order by b.starts_on desc, b.code)
                           from public.batch_staff s join public.batches b on b.id = s.batch_id where s.user_id = p.id), '[]'::jsonb))
      order by p.role = 'admin' desc, lower(p.full_name), p.email)
    from public.profiles p where p.role in ('instructor','admin')), '[]'::jsonb);
end $$;

create function public.admin_set_role_by_email(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid; p public.profiles;
begin
  perform public.require_admin();
  select id into uid from public.profiles where lower(email) = lower(trim(coalesce(p_email, ''))) order by created_at limit 1;
  if uid is null then raise exception 'No account with email %', p_email using errcode = 'P0002'; end if;
  p := public.change_role(uid, p_role);
  return jsonb_build_object('id', p.id, 'email', p.email, 'name', p.full_name, 'role', p.role);
end $$;

create function public.admin_unassign_staff(p_batch uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r text;
begin
  perform public.require_admin();
  delete from public.batch_staff where batch_id = p_batch and user_id = p_user returning role into r;
  if r is null then raise exception 'This person does not teach that batch' using errcode = 'P0002'; end if;
  perform public.audit('staff.unassign', 'batch', p_batch::text, p_user,
    jsonb_build_object('batch', (select code from public.batches where id = p_batch), 'role', r));
end $$;

-- ============================================================================
-- Admin: turning a seat request into an enrollment
-- ============================================================================
create function public.admin_convert_seat_request(p_id uuid, p_starts_on date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.seat_requests; sid uuid; eid uuid;
begin
  perform public.require_admin();
  select * into r from public.seat_requests where id = p_id for update;
  if not found then raise exception 'Unknown seat request' using errcode = 'P0002'; end if;
  if r.status = 'converted' then raise exception 'This request is already converted' using errcode = '22023'; end if;
  select id into sid from public.profiles where lower(email) = r.email order by created_at limit 1;
  if sid is null then
    raise exception 'No account with email % yet. Ask them to sign up first.', r.email using errcode = 'P0002';
  end if;
  eid := public.enroll_student(sid, r.program_id, coalesce(p_starts_on, r.start_date), 'admin', null);
  update public.seat_requests set status = 'converted', handled_by = auth.uid(), updated_at = now()
   where id = r.id returning * into r;
  perform public.audit('seat_request.convert', 'seat_request', r.id::text, sid,
    jsonb_build_object('reference', r.reference, 'enrollment_id', eid,
                       'batch', (select b.code from public.enrollments e join public.batches b on b.id = e.batch_id where e.id = eid)));
  perform public.sync_access(eid, auth.uid());
  return jsonb_build_object('enrollment_id', eid, 'request', public.seat_request_json(r));
end $$;

-- ============================================================================
-- Admin: PDF materials. Admins upload PDFs into the private course-files bucket (storage rules below), then
-- attach each file to one lesson or one project. Videos are never stored there and never downloadable.
-- ============================================================================
-- The path rule for course files: '<program>/<folders and name>.pdf', no hidden or empty segments.
create function public.course_file_path_ok(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(char_length(p_name) <= 300
                  and p_name ~ '^[a-z0-9-]+/[A-Za-z0-9/_.-]+\.pdf$'
                  and p_name !~ '(^|/)\.' and p_name !~ '//'
                  and exists (select 1 from public.programs where id = split_part(p_name, '/', 1)), false)
$$;

-- Storage rules (used by the policies below, so signed-in users must be able to call them).
-- Upload: admins only, PDFs only, inside a program's folder, at most 50 MB. The bucket itself also accepts
-- only application/pdf up to 50 MB. Metadata may be absent while the upload is checked.
create function public.can_upload_course_file(p_name text, p_metadata jsonb) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() and public.course_file_path_ok(p_name)
     and coalesce(p_metadata->>'mimetype', 'application/pdf') = 'application/pdf'
     and coalesce((p_metadata->>'size')::bigint, 0) <= 52428800
$$;

-- Delete: admins only, and only files no lesson or project uses any more.
create function public.can_delete_course_file(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() and not exists (select 1 from public.materials where file_path = p_name)
$$;

update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array['application/pdf'], public = false
 where id = 'course-files';
create policy course_files_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'course-files' and public.is_admin());
create policy course_files_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'course-files' and public.can_upload_course_file(name, metadata));
create policy course_files_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'course-files' and public.can_delete_course_file(name));

create function public.material_json(mt public.materials) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', mt.id, 'program_id', mt.program_id, 'title', mt.title, 'file_path', mt.file_path, 'size_bytes', mt.size_bytes,
    'position', mt.position, 'created_at', mt.created_at,
    'lesson', (select jsonb_build_object('id', l.id, 'code', l.code, 'title', l.title, 'term', m.term_no)
               from public.lessons l join public.modules m on m.id = l.module_id where l.id = mt.lesson_id),
    'assignment', (select jsonb_build_object('id', t.id, 'title', t.title, 'term', t.term_no)
                   from public.assignment_templates t where t.id = mt.assignment_template_id))
$$;

create function public.admin_materials(p_program text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.programs where id = p_program) then
    raise exception 'Unknown program' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'materials', coalesce((
      select jsonb_agg(public.material_json(mt) order by coalesce(m.term_no, t.term_no), l.position nulls last,
                       t.due_offset_days nulls last, mt.position, mt.title, mt.id)
      from public.materials mt
      left join public.lessons l on l.id = mt.lesson_id
      left join public.modules m on m.id = l.module_id
      left join public.assignment_templates t on t.id = mt.assignment_template_id
      where mt.program_id = p_program), '[]'::jsonb),
    'unattached_files', coalesce((
      select jsonb_agg(jsonb_build_object('name', o.name,
                                          'size_bytes', case when o.metadata->>'size' ~ '^[0-9]{1,15}$' then (o.metadata->>'size')::bigint end,
                                          'created_at', o.created_at) order by o.name)
      from storage.objects o
      where o.bucket_id = 'course-files' and split_part(o.name, '/', 1) = p_program
        and not exists (select 1 from public.materials x where x.file_path = o.name)), '[]'::jsonb));
end $$;

-- Every term of a program with its lessons and projects, so admins can attach PDFs to a term that has no
-- batch yet.
create function public.admin_program_outline(p_program text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.programs where id = p_program) then
    raise exception 'Unknown program' using errcode = 'P0002';
  end if;
  return jsonb_build_object('terms', coalesce((
    select jsonb_agg(jsonb_build_object(
      'term', t.term_no, 'title', t.title,
      'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'code', l.code, 'title', l.title) order by m.position, l.position)
                           from public.lessons l join public.modules m on m.id = l.module_id
                           where m.program_id = p_program and m.term_no = t.term_no), '[]'::jsonb),
      'projects', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title) order by a.due_offset_days, a.title, a.id)
                            from public.assignment_templates a
                            where a.program_id = p_program and a.term_no = t.term_no), '[]'::jsonb))
      order by t.term_no)
    from public.program_terms t where t.program_id = p_program), '[]'::jsonb));
end $$;

create function public.admin_add_material(
  p_file_path           text,
  p_title               text,
  p_lesson              uuid default null,
  p_assignment_template uuid default null,
  p_position            int default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_path  text := trim(coalesce(p_file_path, ''));
  v_title text := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');
  prog    text;
  meta    jsonb;
  size    bigint;
  mt      public.materials;
begin
  perform public.require_admin();
  if (p_lesson is null) = (p_assignment_template is null) then
    raise exception 'Attach the PDF to one lesson or one project' using errcode = '22023';
  end if;
  if p_lesson is not null then
    select m.program_id into prog from public.lessons l join public.modules m on m.id = l.module_id where l.id = p_lesson;
    if prog is null then raise exception 'Unknown lesson' using errcode = 'P0002'; end if;
  else
    select program_id into prog from public.assignment_templates where id = p_assignment_template;
    if prog is null then raise exception 'Unknown project' using errcode = 'P0002'; end if;
  end if;
  if not public.course_file_path_ok(v_path) or split_part(v_path, '/', 1) <> prog then
    raise exception 'The file must be a PDF in the %/ folder', prog using errcode = '22023';
  end if;
  if char_length(v_title) not between 1 and 120 or v_title ~ '[[:cntrl:]]' then
    raise exception 'Give the file a title of 1 to 120 characters' using errcode = '22023';
  end if;
  if p_position is not null and p_position not between 1 and 1000 then
    raise exception 'Position must be between 1 and 1000' using errcode = '22023';
  end if;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'course-files' and o.name = v_path;
  if not found then raise exception 'Upload the file first' using errcode = '22023'; end if;
  size := case when meta->>'size' ~ '^[0-9]{1,15}$' then (meta->>'size')::bigint else 0 end;
  if coalesce(meta->>'mimetype', 'application/pdf') <> 'application/pdf' or size > 52428800 then
    raise exception 'Only PDF files up to 50 MB can be attached' using errcode = '22023';
  end if;
  if exists (select 1 from public.materials where file_path = v_path) then
    raise exception 'This file is already attached' using errcode = '23505';
  end if;

  insert into public.materials (program_id, lesson_id, assignment_template_id, title, file_path, size_bytes, position)
  values (prog, p_lesson, p_assignment_template, v_title, v_path, size,
          coalesce(p_position, (select coalesce(max(position), 0) + 1 from public.materials
                                where (p_lesson is not null and lesson_id = p_lesson)
                                   or (p_assignment_template is not null and assignment_template_id = p_assignment_template))))
  returning * into mt;
  perform public.audit('material.add', 'material', mt.id::text, null,
    jsonb_build_object('file_path', mt.file_path, 'title', mt.title, 'lesson', p_lesson, 'assignment_template', p_assignment_template));
  return public.material_json(mt);
end $$;

create function public.admin_remove_material(p_material uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare mt public.materials;
begin
  perform public.require_admin();
  delete from public.materials where id = p_material returning * into mt;
  if not found then raise exception 'Unknown material' using errcode = 'P0002'; end if;
  perform public.audit('material.remove', 'material', mt.id::text, null, jsonb_build_object('file_path', mt.file_path, 'title', mt.title));
  return jsonb_build_object('id', mt.id, 'file_path', mt.file_path);
end $$;

-- ============================================================================
-- Admin: the audit log
-- ============================================================================
create function public.admin_audit_log(p_limit int default 100, p_before timestamptz default null, p_person uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'Limit must be between 1 and 500' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(public.audit_json(a) order by a.created_at desc, a.id)
    from (select * from public.admin_audit
          where (p_before is null or created_at < p_before) and (p_person is null or person_id = p_person)
          order by created_at desc, id limit p_limit) a), '[]'::jsonb);
end $$;

-- ============================================================================
-- Who may call what. Supabase opens every new function to anon and authenticated by default: close all new
-- ones, then open the admin functions (each checks the admin role itself) and the storage rules.
-- ============================================================================
revoke execute on function
  public.access_rule(text, text, timestamptz, boolean, timestamptz, timestamptz),
  public.access_of(uuid, timestamptz),
  public.access_open(public.enrollments),
  public.person_name(uuid),
  public.access_json(public.access_info),
  public.audit(text, text, text, uuid, jsonb),
  public.sync_access(uuid, uuid),
  public.apply_access_rules(),
  public.change_role(uuid, text),
  public.admin_overview(),
  public.admin_students(text, text, uuid, text, text, text, text, boolean, int, int),
  public.payment_json(public.payments),
  public.audit_json(public.admin_audit),
  public.admin_student(uuid),
  public.admin_set_access(uuid, text, text, timestamptz),
  public.admin_record_payment(uuid, numeric, text, text, text, date),
  public.admin_void_payment(uuid, text),
  public.admin_batch_json(public.batches),
  public.admin_batches(text, text),
  public.admin_update_batch(uuid, int, text, text),
  public.admin_staff(),
  public.admin_set_role_by_email(text, text),
  public.admin_unassign_staff(uuid, uuid),
  public.admin_convert_seat_request(uuid, date),
  public.course_file_path_ok(text),
  public.can_upload_course_file(text, jsonb),
  public.can_delete_course_file(text),
  public.material_json(public.materials),
  public.admin_materials(text),
  public.admin_program_outline(text),
  public.admin_add_material(text, text, uuid, uuid, int),
  public.admin_remove_material(uuid),
  public.admin_audit_log(int, timestamptz, uuid)
  from public, anon, authenticated;

grant execute on function
  public.admin_overview(),
  public.admin_students(text, text, uuid, text, text, text, text, boolean, int, int),
  public.admin_student(uuid),
  public.admin_set_access(uuid, text, text, timestamptz),
  public.admin_record_payment(uuid, numeric, text, text, text, date),
  public.admin_void_payment(uuid, text),
  public.admin_batches(text, text),
  public.admin_update_batch(uuid, int, text, text),
  public.admin_staff(),
  public.admin_set_role_by_email(text, text),
  public.admin_unassign_staff(uuid, uuid),
  public.admin_convert_seat_request(uuid, date),
  public.admin_materials(text),
  public.admin_program_outline(text),
  public.admin_add_material(text, text, uuid, uuid, int),
  public.admin_remove_material(uuid),
  public.admin_audit_log(int, timestamptz, uuid),
  public.can_upload_course_file(text, jsonb),
  public.can_delete_course_file(text)
  to authenticated;

-- The hourly job: server side only (schedule it like queue_session_reminders; see docs/admin-api.md).
grant execute on function public.apply_access_rules() to service_role;
