-- Programs as sequences of 12-week terms.
-- Owner decision (2026-10-02): Bachelor's programs run 12 terms (3-4 years part-time), Master's 4 terms
-- (12-18 months), certificates 1 term. Each term is one batch: 12 weeks from a first Monday, the usual
-- Tuesday class and Thursday office hours, four competency lessons and three graded projects.
--
-- Rules:
--   * A batch belongs to one term and runs only that term's classes and projects.
--   * A student sees and tracks lessons and PDFs only of terms in which they hold an ACTIVE or COMPLETED
--     enrollment in that program. Reserved, paused and withdrawn enrollments open nothing.
--   * A term is completed when its batch has ended and the student has completed every lesson of the term
--     and passed every project of the batch (Proficient or Distinguished), or when an admin marks the
--     enrollment completed. The daily job then reserves the student's seat in the next term's batch
--     (status 'reserved': no access until it is activated). Completing the final term completes the program.

-- ============================================================================
-- Terms of each program
-- ============================================================================
create table public.program_terms (
  program_id text not null references public.programs(id) on delete cascade,
  term_no    int  not null check (term_no between 1 and 24),
  title      text not null,
  badge      text not null,                          -- skill badge for completing the term
  primary key (program_id, term_no)
);

alter table public.modules              add column term_no int not null default 1;
alter table public.session_templates    add column term_no int not null default 1;
alter table public.assignment_templates add column term_no int not null default 1;
alter table public.batches              add column term_no int not null default 1;
alter table public.modules              add foreign key (program_id, term_no) references public.program_terms (program_id, term_no) on delete cascade;
alter table public.session_templates    add foreign key (program_id, term_no) references public.program_terms (program_id, term_no) on delete cascade;
alter table public.assignment_templates add foreign key (program_id, term_no) references public.program_terms (program_id, term_no) on delete cascade;
alter table public.batches              add foreign key (program_id, term_no) references public.program_terms (program_id, term_no);

-- Several terms of a program can start on the same Monday; codes carry the term (BSAIML-T2-2026-11).
alter table public.batches drop constraint batches_program_id_starts_on_key;
alter table public.batches add constraint batches_program_term_starts_key unique (program_id, term_no, starts_on);

-- 'reserved': a seat held in the next term for a student who finished the previous one. It grants no
-- access until an admin (later: the term payment) makes it active.
alter table public.enrollments drop constraint enrollments_status_check;
alter table public.enrollments add constraint enrollments_status_check
  check (status in ('active','reserved','paused','completed','withdrawn'));
alter table public.enrollments drop constraint enrollments_source_check;
alter table public.enrollments add constraint enrollments_source_check
  check (source in ('payment','admin','transfer','progression'));

alter table public.program_terms enable row level security;
revoke all on public.program_terms from anon, authenticated;     -- read through the portal functions only
grant all on public.program_terms to service_role;

-- ============================================================================
-- Helpers (internal)
-- ============================================================================
-- May this student study this term of the program? Only with an active or completed enrollment in a
-- batch of that term.
create function public.term_open(p_student uuid, p_program text, p_term int) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_student is not null and exists (
    select 1 from public.enrollments e join public.batches b on b.id = e.batch_id
    where e.student_id = p_student and e.program_id = p_program and b.term_no = p_term
      and e.status in ('active','completed'))
$$;

-- Has the student met the term's requirements in this batch: every lesson of the term complete and every
-- project of the batch graded Proficient or Distinguished?
create function public.term_requirements_met(p_student uuid, p_batch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.batches where id = p_batch)
    and not exists (
      select 1 from public.batches b
      join public.modules m on m.program_id = b.program_id and m.term_no = b.term_no
      join public.lessons l on l.module_id = m.id
      left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = p_student
      where b.id = p_batch and lp.completed_at is null)
    and not exists (
      select 1 from public.batch_assignments a
      left join public.submissions s on s.assignment_id = a.id and s.student_id = p_student
      where a.batch_id = p_batch and coalesce(s.grade, '') not in ('proficient','distinguished'))
$$;

-- The term of a PDF: its lesson's term or its project's term (null for a program-wide file).
create function public.material_term(p_lesson uuid, p_assignment_template uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select m.term_no from public.lessons l join public.modules m on m.id = l.module_id where l.id = p_lesson),
                  (select t.term_no from public.assignment_templates t where t.id = p_assignment_template))
$$;

-- Start of the next term after a batch that ended on p_after: the first first-Monday after that day,
-- and never in the past (a student who finishes late joins the next start from today).
create function public.next_term_start(p_after date, p_today date) returns date
language plpgsql immutable as $$
declare
  m date := date_trunc('month', greatest(p_after + 1, p_today))::date;
  d date;
begin
  loop
    d := public.first_monday(m);
    if d > p_after and d >= p_today then return d; end if;
    m := (m + interval '1 month')::date;
  end loop;
end $$;

-- ============================================================================
-- Batches: one term each
-- ============================================================================
drop function public.admin_create_batch(text, date);
drop function public.create_batch(text, date);

-- Create the batch of one term of a program starting on a date, with that term's live sessions and
-- assignment due dates. Safe to call repeatedly: an existing batch is returned unchanged.
create function public.create_batch(p_program text, p_starts_on date, p_term int default 1) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prog public.programs;
  bid  uuid;
begin
  select * into prog from public.programs where id = p_program and active;
  if not found then raise exception 'Unknown or inactive program: %', p_program using errcode = 'P0002'; end if;
  if not exists (select 1 from public.program_terms where program_id = p_program and term_no = p_term) then
    raise exception 'Program % has no term %', p_program, p_term using errcode = '22023';
  end if;
  if extract(isodow from p_starts_on) <> 1 then
    raise exception 'Batches start on a Monday (got %)', p_starts_on using errcode = '22023';
  end if;

  insert into public.batches (program_id, term_no, code, starts_on, ends_on, timezone, capacity)
  values (p_program, p_term,
          upper(replace(p_program, '-', '')) || '-T' || p_term || '-' || to_char(p_starts_on, 'YYYY-MM'),
          p_starts_on,
          p_starts_on + prog.duration_weeks * 7 - 1,
          prog.timezone,
          prog.capacity)
  on conflict (program_id, term_no, starts_on) do nothing
  returning id into bid;

  if bid is null then
    select id into bid from public.batches where program_id = p_program and term_no = p_term and starts_on = p_starts_on;
    return bid;
  end if;

  -- Only this term's classes and projects.
  insert into public.sessions (batch_id, template_id, title, join_url, starts_at, ends_at)
  select bid, t.id, t.title,
         'https://meet.jit.si/nuvora-' || bid::text || '-' || t.id::text,
         ((p_starts_on + (t.week - 1) * 7 + (t.weekday - 1)) + t.start_time) at time zone prog.timezone,
         ((p_starts_on + (t.week - 1) * 7 + (t.weekday - 1)) + t.start_time) at time zone prog.timezone
           + make_interval(mins => t.duration_minutes)
  from public.session_templates t
  where t.program_id = p_program and t.term_no = p_term;

  insert into public.batch_assignments (batch_id, template_id, title, instructions, due_at)
  select bid, t.id, t.title, t.instructions,
         ((p_starts_on + t.due_offset_days) + time '23:59') at time zone prog.timezone
  from public.assignment_templates t
  where t.program_id = p_program and t.term_no = p_term;

  return bid;
end $$;

create function public.admin_create_batch(p_program text, p_starts_on date, p_term int default 1) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return public.create_batch(p_program, p_starts_on, p_term);
end $$;

-- New students start in term 1: the monthly job creates next month's term-1 batch of every active program.
-- Later terms are created when students progress (progress_terms).
create or replace function public.create_monthly_batches(p_month date default (date_trunc('month', now()) + interval '1 month')::date)
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

-- ============================================================================
-- Enrollment (internal) and admin tools: reserved seats count toward capacity
-- ============================================================================
create or replace function public.enroll_student(
  p_student     uuid,
  p_program     text,
  p_starts_on   date default null,
  p_source      text default 'admin',
  p_payment_ref text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  starts date := coalesce(p_starts_on, public.next_start_date());
  bid  uuid;
  eid  uuid;
  used int;
  b    public.batches;
begin
  -- A repeated payment notification must not create a second enrollment.
  if p_payment_ref is not null then
    select id into eid from public.enrollments where payment_ref = p_payment_ref;
    if eid is not null then return eid; end if;
  end if;

  if not exists (select 1 from public.profiles where id = p_student) then
    raise exception 'Unknown student' using errcode = 'P0002';
  end if;

  -- New students join term 1.
  bid := public.create_batch(p_program, starts, 1);
  select * into b from public.batches where id = bid;
  if b.status in ('completed','cancelled') then
    raise exception 'Batch % is closed', b.code using errcode = '22023';
  end if;

  -- Already in this batch: reactivate if needed and return it.
  select id into eid from public.enrollments where student_id = p_student and batch_id = bid;
  if eid is not null then
    update public.enrollments set status = 'active', updated_at = now() where id = eid and status <> 'active';
    return eid;
  end if;

  select count(*) into used from public.enrollments where batch_id = bid and status in ('active','reserved');
  if used >= b.capacity then
    raise exception 'Batch % is full', b.code using errcode = '23P01';
  end if;

  if exists (select 1 from public.enrollments where student_id = p_student and program_id = p_program and status = 'active') then
    raise exception 'Student is already actively enrolled in %', p_program using errcode = '23505';
  end if;

  insert into public.enrollments (student_id, batch_id, program_id, status, source, payment_ref)
  values (p_student, bid, p_program, 'active', p_source, p_payment_ref)
  returning id into eid;

  insert into public.notifications (user_id, kind, ref_id, title, body)
  values (p_student, 'welcome', bid, 'Welcome to ' || b.code,
          'Your batch starts on ' || to_char(b.starts_on, 'Mon DD, YYYY') || '. Your schedule and first lessons are ready.')
  on conflict do nothing;

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
end $$;

-- Admins activate reserved seats, pause, withdraw, or mark a term completed.
create or replace function public.admin_set_enrollment_status(p_enrollment uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform public.require_admin();
  if p_status not in ('active','reserved','paused','completed','withdrawn') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  begin
    update public.enrollments set status = p_status, updated_at = now() where id = p_enrollment;
    get diagnostics n = row_count;
  exception when unique_violation then
    raise exception 'This student already has an active enrollment in that program' using errcode = '23505';
  end;
  if n = 0 then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
end $$;

-- ============================================================================
-- Progression (run daily, from update_batch_statuses)
-- ============================================================================
-- 1. In every finished batch, an active enrollment whose term requirements are met becomes completed.
--    (Students who finish late are picked up on a later day; admins can also mark completion.)
-- 2. Every completed enrollment in a finished batch gets one reserved seat in the next term's batch, which
--    is created if needed on the first first-Monday after the batch ended. Continuing students always keep
--    a place, whatever the capacity. Nothing is ever reserved twice: a student who already has any
--    enrollment in a later term of the program is skipped (also when they declined the seat).
-- Returns the number of seats reserved.
create function public.progress_terms(p_today date default current_date) returns int
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
    where e.status = 'completed' and b.status = 'completed'
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
            'Your place in ' || nb.code || ' is held for you. It opens as soon as your enrollment for the term is confirmed.')
    on conflict (user_id, kind, ref_id) do nothing;
  end loop;
  return made;
end $$;

-- Move batches through scheduled -> active -> completed based on today's date, and progress students
-- whose term has finished (run daily). Returns the number of batch status changes.
create or replace function public.update_batch_statuses(p_today date default current_date) returns int
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
  return n1 + n2;
end $$;

-- ============================================================================
-- Learning: tracking is limited to open terms
-- ============================================================================
create or replace function public.record_progress(p_lesson uuid, p_from int, p_to int, p_position int default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid      uuid := auth.uid();
  dur      int;
  nb       int;
  arr      boolean[];
  f        int;
  t        int;
  i        int;
  secs     int;
  done_at  timestamptz;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;

  select l.duration_seconds into dur
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson and public.term_open(uid, m.program_id, m.term_no);
  if dur is null then raise exception 'Not enrolled in this lesson''s program and term' using errcode = '42501'; end if;
  if dur = 0 then raise exception 'Lesson has no video' using errcode = '22023'; end if;

  f := greatest(0, least(p_from, dur));
  t := greatest(0, least(p_to, dur));
  if t < f then raise exception 'Invalid range' using errcode = '22023'; end if;
  if t - f > 30 then raise exception 'Progress updates may cover at most 30 seconds' using errcode = '22023'; end if;

  nb := ceil(dur / 10.0)::int;
  select watched, completed_at into arr, done_at from public.lesson_progress where student_id = uid and lesson_id = p_lesson for update;
  if arr is null or coalesce(array_length(arr, 1), 0) < nb then
    arr := coalesce(arr, '{}'::boolean[]) || array_fill(false, array[nb - coalesce(array_length(arr, 1), 0)]);
  end if;

  if t > f then
    for i in (f / 10)..(ceil(t / 10.0)::int - 1) loop
      if i >= 0 and i < nb then arr[i + 1] := true; end if;
    end loop;
  end if;

  select least(dur, count(*) filter (where x) * 10) into secs from unnest(arr) as x;
  if done_at is null and secs >= ceil(dur * 0.9) then done_at := now(); end if;

  insert into public.lesson_progress (student_id, lesson_id, watched, watched_seconds, last_position, completed_at, updated_at)
  values (uid, p_lesson, arr, secs, coalesce(p_position, t), done_at, now())
  on conflict (student_id, lesson_id) do update
    set watched = excluded.watched, watched_seconds = excluded.watched_seconds,
        last_position = excluded.last_position, completed_at = excluded.completed_at, updated_at = now();

  update public.profiles set last_active_at = now() where id = uid;

  return jsonb_build_object('watched_seconds', secs,
                            'percent', round(100.0 * secs / dur),
                            'completed', done_at is not null,
                            'last_position', coalesce(p_position, t));
end $$;

create or replace function public.mark_reading_done(p_lesson uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select l.kind into k from public.lessons l join public.modules m on m.id = l.module_id
  where l.id = p_lesson and public.term_open(uid, m.program_id, m.term_no);
  if k is null then raise exception 'Not enrolled in this lesson''s program and term' using errcode = '42501'; end if;
  if k <> 'reading' then raise exception 'Only reading lessons can be marked done' using errcode = '22023'; end if;
  insert into public.lesson_progress (student_id, lesson_id, completed_at) values (uid, p_lesson, now())
  on conflict (student_id, lesson_id) do update set completed_at = coalesce(public.lesson_progress.completed_at, now()), updated_at = now();
  update public.profiles set last_active_at = now() where id = uid;
end $$;

-- PDFs: students get the files of terms they hold an active or completed enrollment for (program-wide
-- files with any such enrollment); staff the programs they teach; admins everything.
create or replace function public.can_read_material(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.materials mt
    where mt.file_path = p_path
      and (public.is_admin()
           or exists (select 1 from public.enrollments e join public.batches b on b.id = e.batch_id
                      where e.student_id = auth.uid() and e.program_id = mt.program_id
                        and e.status in ('active','completed')
                        and b.term_no = coalesce(public.material_term(mt.lesson_id, mt.assignment_template_id), b.term_no))
           or exists (select 1 from public.batch_staff s join public.batches b on b.id = s.batch_id
                      where s.user_id = auth.uid() and b.program_id = mt.program_id)))
$$;

-- ============================================================================
-- Portal pages
-- ============================================================================
create or replace function public.batch_json(b public.batches, p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'program_id', b.program_id,
    'program', (select name from public.programs where id = b.program_id),
    'term', b.term_no, 'term_title', (select title from public.program_terms where program_id = b.program_id and term_no = b.term_no),
    'terms', (select count(*) from public.program_terms where program_id = b.program_id),
    'starts_on', b.starts_on, 'ends_on', b.ends_on, 'status', b.status, 'timezone', b.timezone,
    'week', public.batch_week(b, p_now), 'weeks', (b.ends_on - b.starts_on + 1) / 7)
$$;

-- One batch as the student's home and dashboard show it: the term's lesson counts, next classes
-- (a Zoom link only from 15 minutes before a class until it ends, by the real clock), recordings,
-- attendance and the student's own assignment status.
create function public.batch_summary_json(b public.batches, p_student uuid, p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.batch_json(b, p_now) || jsonb_build_object(
    'lessons_total', (select count(*) from public.lessons l join public.modules m on m.id = l.module_id
                      where m.program_id = b.program_id and m.term_no = b.term_no),
    'lessons_completed', (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
                          join public.modules m on m.id = l.module_id
                          where m.program_id = b.program_id and m.term_no = b.term_no
                            and lp.student_id = p_student and lp.completed_at is not null),
    'next_sessions', coalesce((select jsonb_agg(x order by x->>'starts_at') from (
         select jsonb_build_object('id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                                   'status', s.status,
                                   -- Real clock, not p_now: the caller must not be able to unlock links early.
                                   'join_url', case when now() between s.starts_at - interval '15 minutes' and s.ends_at
                                                    then s.join_url end) as x
         from public.sessions s where s.batch_id = b.id and s.ends_at > p_now and s.status <> 'cancelled'
         order by s.starts_at limit 3) q), '[]'::jsonb),
    'recordings', (select count(*) from public.sessions s where s.batch_id = b.id and s.recording_asset_id is not null),
    'attendance', jsonb_build_object(
         'attended', (select count(*) from public.attendance a join public.sessions s on s.id = a.session_id
                      where s.batch_id = b.id and a.student_id = p_student),
         'held', (select count(*) from public.sessions s where s.batch_id = b.id and s.ends_at <= p_now and s.status <> 'cancelled')),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
         'id', a.id, 'title', a.title, 'due_at', a.due_at,
         'status', coalesce(sub.status, case when a.due_at < p_now then 'overdue' else 'not_started' end),
         'grade', sub.grade, 'attempt', sub.attempt,
         'late', sub.submitted_at is not null and sub.submitted_at > a.due_at) order by a.due_at)
       from public.batch_assignments a
       left join public.submissions sub on sub.assignment_id = a.id and sub.student_id = p_student
       where a.batch_id = b.id), '[]'::jsonb))
$$;

-- Everything the portal shell shows: the caller's active batches (lesson counts for the batch's term),
-- reserved next-term seats, lessons to continue (open terms only) and the unread count.
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

-- Course page: the batch's term, plus earlier terms the student completed (for review). Lessons of terms
-- the student has not reached are never listed. Staff and admins see the batch's term.
create or replace function public.my_course(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.batches;
begin
  b := public.portal_batch(p_batch);
  return jsonb_build_object(
    'batch', public.batch_json(b),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'position', m.position, 'title', m.title, 'term', m.term_no, 'current', m.term_no = b.term_no,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'code', l.code, 'title', l.title, 'kind', l.kind, 'duration', l.duration_seconds,
            'percent', public.lesson_percent(l.kind, l.duration_seconds, lp.watched_seconds, lp.completed_at),
            'completed', lp.completed_at is not null,
            'last_position', coalesce(lp.last_position, 0),
            'pdfs', (select count(*) from public.materials mt where mt.lesson_id = l.id)) order by l.position)
          from public.lessons l
          left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = uid
          where l.module_id = m.id), '[]'::jsonb)) order by m.term_no, m.position)
      from public.modules m
      where m.program_id = b.program_id
        and (m.term_no = b.term_no or public.term_open(uid, b.program_id, m.term_no))), '[]'::jsonb));
end $$;

-- Lesson page: the lesson, the caller's progress, and its neighbours within the term.
-- Students need an active or completed enrollment in that term; staff of one of the program's batches
-- and admins may preview.
create or replace function public.my_lesson(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  l   public.lessons;
  m   public.modules;
  lp  public.lesson_progress;
  bid uuid;
  enrolled boolean;
  r   jsonb;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into l from public.lessons where id = p_lesson;
  select * into m from public.modules where id = l.module_id;
  enrolled := l.id is not null and public.term_open(uid, m.program_id, m.term_no);
  if enrolled then
    select e.batch_id into bid from public.enrollments e join public.batches b on b.id = e.batch_id
     where e.student_id = uid and e.program_id = m.program_id and b.term_no = m.term_no and e.status in ('active','completed')
     order by e.status = 'active' desc, b.starts_on desc limit 1;
  else
    select s.batch_id into bid from public.batch_staff s join public.batches b on b.id = s.batch_id
     where s.user_id = uid and b.program_id = m.program_id order by b.starts_on desc limit 1;
  end if;
  if l.id is null or (bid is null and not public.is_admin()) then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  select * into lp from public.lesson_progress where student_id = uid and lesson_id = l.id;

  with ordered as (
    select x.id, x.title, row_number() over (order by mm.position, x.position) as n
    from public.lessons x join public.modules mm on mm.id = x.module_id
    where mm.program_id = m.program_id and mm.term_no = m.term_no),
  cur as (select n from ordered where id = l.id)
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'title', l.title, 'kind', l.kind, 'duration', l.duration_seconds,
    'module', jsonb_build_object('id', m.id, 'position', m.position, 'title', m.title),
    'term', jsonb_build_object('no', m.term_no, 'title', (select title from public.program_terms where program_id = m.program_id and term_no = m.term_no)),
    'program_id', m.program_id, 'batch_id', bid, 'can_track', enrolled,
    'watched_seconds', coalesce(lp.watched_seconds, 0),
    'percent', public.lesson_percent(l.kind, l.duration_seconds, lp.watched_seconds, lp.completed_at),
    'completed', lp.completed_at is not null,
    'last_position', coalesce(lp.last_position, 0),
    'materials', public.materials_json(l.id, null),
    'index', (select n from cur),
    'total', (select count(*) from ordered),
    'prev', (select jsonb_build_object('id', o.id, 'title', o.title) from ordered o, cur where o.n = cur.n - 1),
    'next', (select jsonb_build_object('id', o.id, 'title', o.title) from ordered o, cur where o.n = cur.n + 1))
  into r;
  return r;
end $$;

-- Roster: progress counts are for the batch's term.
create or replace function public.staff_roster(p_batch uuid, p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b public.batches;
begin
  perform public.require_staff();
  select * into b from public.batches where id = p_batch;
  if not found or not (public.is_admin() or public.teaches(p_batch)) then
    raise exception 'Batch not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'batch', public.batch_json(b, p_now),
    'lessons_total', (select count(*) from public.lessons l join public.modules m on m.id = l.module_id
                      where m.program_id = b.program_id and m.term_no = b.term_no),
    'sessions_held', (select count(*) from public.sessions s where s.batch_id = b.id and s.ends_at <= p_now and s.status <> 'cancelled'),
    'assignments_total', (select count(*) from public.batch_assignments a where a.batch_id = b.id),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'email', p.email, 'status', e.status, 'enrolled_at', e.enrolled_at,
        'last_active_at', p.last_active_at,
        'days_inactive', floor(extract(epoch from (p_now - coalesce(p.last_active_at, e.enrolled_at))) / 86400)::int,
        'lessons_completed', (select count(*) from public.lesson_progress lp
                              join public.lessons l on l.id = lp.lesson_id join public.modules m on m.id = l.module_id
                              where m.program_id = b.program_id and m.term_no = b.term_no
                                and lp.student_id = p.id and lp.completed_at is not null),
        'attended', (select count(*) from public.attendance at join public.sessions s on s.id = at.session_id
                     where s.batch_id = b.id and at.student_id = p.id),
        'passed', (select count(*) from public.submissions s join public.batch_assignments a on a.id = s.assignment_id
                   where a.batch_id = b.id and s.student_id = p.id and s.status = 'graded'))
        order by lower(p.full_name), p.email)
      from public.enrollments e join public.profiles p on p.id = e.student_id
      where e.batch_id = b.id and e.status in ('active','paused')), '[]'::jsonb));
end $$;

-- ============================================================================
-- Who may call what
-- ============================================================================
revoke execute on function
  public.term_open(uuid, text, int),
  public.term_requirements_met(uuid, uuid),
  public.material_term(uuid, uuid),
  public.next_term_start(date, date),
  public.create_batch(text, date, int),
  public.admin_create_batch(text, date, int),
  public.progress_terms(date),
  public.batch_summary_json(public.batches, uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.admin_create_batch(text, date, int) to authenticated;
grant execute on function public.create_batch(text, date, int), public.progress_terms(date) to service_role;
