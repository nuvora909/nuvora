-- Nuvora automation and learning functions.
-- Internal functions (batch creation, enrollment, attendance, reminders) are callable only by the
-- service role and scheduled jobs. Student and staff actions go through checked RPCs.

-- ============================================================================
-- Dates
-- ============================================================================
-- First Monday of the month containing p_month.
create function public.first_monday(p_month date) returns date
language sql immutable as $$
  select (date_trunc('month', p_month::timestamp)::date
          + ((8 - extract(isodow from date_trunc('month', p_month::timestamp))::int) % 7))
$$;

-- The next start a new student can still join: applications close 7 days before a batch starts.
create function public.next_start_date(p_today date default current_date) returns date
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

-- ============================================================================
-- Batches (internal)
-- ============================================================================
-- Create the batch for a program starting on a date, with its live sessions and assignment due dates.
-- Safe to call repeatedly: an existing batch is returned unchanged.
create function public.create_batch(p_program text, p_starts_on date) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prog public.programs;
  bid  uuid;
begin
  select * into prog from public.programs where id = p_program and active;
  if not found then raise exception 'Unknown or inactive program: %', p_program using errcode = 'P0002'; end if;
  if extract(isodow from p_starts_on) <> 1 then
    raise exception 'Batches start on a Monday (got %)', p_starts_on using errcode = '22023';
  end if;

  insert into public.batches (program_id, code, starts_on, ends_on, timezone, capacity)
  values (p_program,
          upper(replace(p_program, '-', '')) || '-' || to_char(p_starts_on, 'YYYY-MM'),
          p_starts_on,
          p_starts_on + prog.duration_weeks * 7 - 1,
          prog.timezone,
          prog.capacity)
  on conflict (program_id, starts_on) do nothing
  returning id into bid;

  if bid is null then
    select id into bid from public.batches where program_id = p_program and starts_on = p_starts_on;
    return bid;
  end if;

  insert into public.sessions (batch_id, template_id, title, starts_at, ends_at)
  select bid, t.id, t.title,
         ((p_starts_on + (t.week - 1) * 7 + (t.weekday - 1)) + t.start_time) at time zone prog.timezone,
         ((p_starts_on + (t.week - 1) * 7 + (t.weekday - 1)) + t.start_time) at time zone prog.timezone
           + make_interval(mins => t.duration_minutes)
  from public.session_templates t
  where t.program_id = p_program;

  insert into public.batch_assignments (batch_id, template_id, title, instructions, due_at)
  select bid, t.id, t.title, t.instructions,
         ((p_starts_on + t.due_offset_days) + time '23:59') at time zone prog.timezone
  from public.assignment_templates t
  where t.program_id = p_program;

  return bid;
end $$;

-- Create next month's batch for every active program (run by the scheduler on the 1st of each month).
create function public.create_monthly_batches(p_month date default (date_trunc('month', now()) + interval '1 month')::date)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p record;
  made int := 0;
  before_count int;
begin
  for p in select id from public.programs where active order by id loop
    select count(*) into before_count from public.batches where program_id = p.id and starts_on = public.first_monday(p_month);
    perform public.create_batch(p.id, public.first_monday(p_month));
    if before_count = 0 then made := made + 1; end if;
  end loop;
  return made;
end $$;

-- Move batches through scheduled -> active -> completed based on today's date (run daily).
create function public.update_batch_statuses(p_today date default current_date) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n1 int; n2 int;
begin
  update public.batches set status = 'active'
   where status = 'scheduled' and starts_on <= p_today and ends_on >= p_today;
  get diagnostics n1 = row_count;
  update public.batches set status = 'completed'
   where status in ('scheduled','active') and ends_on < p_today;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $$;

-- ============================================================================
-- Enrollment (internal: payment webhook and admin tools call this)
-- ============================================================================
create function public.enroll_student(
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
  cap  int;
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

  bid := public.create_batch(p_program, starts);
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

  select count(*) into used from public.enrollments where batch_id = bid and status = 'active';
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

-- ============================================================================
-- Admin tools (signed-in admins only)
-- ============================================================================
create function public.require_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
end $$;

-- Instructors and admins (by role), or anyone assigned to teach a batch.
create function public.require_staff() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null
     or not (exists (select 1 from public.profiles where id = auth.uid() and role in ('instructor','admin'))
             or exists (select 1 from public.batch_staff where user_id = auth.uid())) then
    raise exception 'Staff only' using errcode = '42501';
  end if;
end $$;

create function public.admin_create_batch(p_program text, p_starts_on date) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return public.create_batch(p_program, p_starts_on);
end $$;

create function public.admin_enroll(p_email text, p_program text, p_starts_on date default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
  perform public.require_admin();
  select id into sid from public.profiles where lower(email) = lower(p_email);
  if sid is null then raise exception 'No account with email %', p_email using errcode = 'P0002'; end if;
  return public.enroll_student(sid, p_program, p_starts_on, 'admin', null);
end $$;

-- Move a student to another batch of the same program; access switches immediately.
create function public.admin_transfer(p_enrollment uuid, p_new_batch uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.enrollments; nb public.batches;
begin
  perform public.require_admin();
  select * into e from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
  select * into nb from public.batches where id = p_new_batch;
  if not found or nb.program_id <> e.program_id then
    raise exception 'Target batch must belong to the same program' using errcode = '22023';
  end if;
  if exists (select 1 from public.enrollments where student_id = e.student_id and batch_id = p_new_batch) then
    raise exception 'Student already has an enrollment in that batch' using errcode = '23505';
  end if;
  update public.enrollments set batch_id = p_new_batch, source = 'transfer', status = 'active', updated_at = now()
   where id = p_enrollment;
end $$;

create function public.admin_set_enrollment_status(p_enrollment uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if p_status not in ('active','paused','completed','withdrawn') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  update public.enrollments set status = p_status, updated_at = now() where id = p_enrollment;
  if not found then raise exception 'Unknown enrollment' using errcode = 'P0002'; end if;
end $$;

create function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if p_role not in ('student','instructor','admin') then raise exception 'Invalid role' using errcode = '22023'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create function public.admin_assign_staff(p_batch uuid, p_user uuid, p_role text default 'instructor') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  insert into public.batch_staff (batch_id, user_id, role) values (p_batch, p_user, p_role)
  on conflict (batch_id, user_id) do update set role = excluded.role;
end $$;

-- ============================================================================
-- Learning: watch progress
-- ============================================================================
-- Called by the video player every ~10-15 s with the span just watched.
-- Only the slices actually played count, a single call can cover at most 30 s, and a lesson
-- is complete once 90% of it has really been watched.
create function public.record_progress(p_lesson uuid, p_from int, p_to int, p_position int default null)
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
  where l.id = p_lesson
    and exists (select 1 from public.enrollments e
                where e.student_id = uid and e.program_id = m.program_id and e.status = 'active');
  if dur is null then raise exception 'Not enrolled in this lesson''s program' using errcode = '42501'; end if;
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

-- Reading lessons are completed by opening them to the end.
create function public.mark_reading_done(p_lesson uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select l.kind into k from public.lessons l join public.modules m on m.id = l.module_id
  where l.id = p_lesson and exists (select 1 from public.enrollments e
        where e.student_id = uid and e.program_id = m.program_id and e.status = 'active');
  if k is null then raise exception 'Not enrolled in this lesson''s program' using errcode = '42501'; end if;
  if k <> 'reading' then raise exception 'Only reading lessons can be marked done' using errcode = '22023'; end if;
  insert into public.lesson_progress (student_id, lesson_id, completed_at) values (uid, p_lesson, now())
  on conflict (student_id, lesson_id) do update set completed_at = coalesce(public.lesson_progress.completed_at, now()), updated_at = now();
  update public.profiles set last_active_at = now() where id = uid;
end $$;

-- ============================================================================
-- Assignments and grading
-- ============================================================================
create function public.submit_assignment(p_assignment uuid, p_link text default null, p_file text default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  bid uuid;
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
  if bid is null or not exists (select 1 from public.enrollments
                                where student_id = uid and batch_id = bid and status = 'active') then
    raise exception 'This assignment is not part of your batch' using errcode = '42501';
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

-- Instructors of the batch (or admins) grade on the four-level mastery rubric.
-- Proficient or Distinguished passes; Basic or Not yet asks for a resubmission.
create function public.grade_submission(p_submission uuid, p_grade text, p_feedback text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.submissions; bid uuid;
begin
  if p_grade not in ('distinguished','proficient','basic','not_yet') then
    raise exception 'Invalid grade %', p_grade using errcode = '22023';
  end if;
  if char_length(p_feedback) > 5000 then
    raise exception 'Feedback is limited to 5000 characters' using errcode = '22001';
  end if;
  select * into s from public.submissions where id = p_submission;
  if not found then raise exception 'Unknown submission' using errcode = 'P0002'; end if;
  select batch_id into bid from public.batch_assignments where id = s.assignment_id;
  if not (public.is_admin() or public.teaches(bid)) then
    raise exception 'Only this batch''s instructors can grade it' using errcode = '42501';
  end if;
  if s.status <> 'submitted' then raise exception 'Nothing new to grade' using errcode = '22023'; end if;

  update public.submissions
     set grade = p_grade, feedback = p_feedback, graded_by = auth.uid(), graded_at = now(),
         status = case when p_grade in ('distinguished','proficient') then 'graded' else 'needs_resubmission' end
   where id = p_submission;

  insert into public.notifications (user_id, kind, ref_id, title, body)
  values (s.student_id, 'graded', gen_random_uuid(), 'Your assignment was reviewed',
          'Result: ' || replace(p_grade, '_', ' ') || coalesce('. ' || p_feedback, ''));
end $$;

-- ============================================================================
-- Live classes: attendance and recordings (internal: Jitsi webhook handler calls these)
-- ============================================================================
create function public.record_attendance(p_session uuid, p_email text, p_joined timestamptz, p_left timestamptz)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid; bid uuid; mins int;
begin
  select id into sid from public.profiles where lower(email) = lower(p_email);
  select batch_id into bid from public.sessions where id = p_session;
  if sid is null or bid is null then return false; end if;
  if not exists (select 1 from public.enrollments where student_id = sid and batch_id = bid and status = 'active') then
    return false;  -- not in this batch: ignore
  end if;
  mins := greatest(0, floor(extract(epoch from (p_left - p_joined)) / 60))::int;
  insert into public.attendance (session_id, student_id, first_joined_at, minutes)
  values (p_session, sid, p_joined, mins)
  on conflict (session_id, student_id) do update
    set minutes = public.attendance.minutes + excluded.minutes,
        first_joined_at = least(public.attendance.first_joined_at, excluded.first_joined_at);
  update public.profiles set last_active_at = greatest(coalesce(last_active_at, p_left), p_left) where id = sid;
  return true;
end $$;

create function public.attach_recording(p_session uuid, p_asset text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare bid uuid; t text; n int;
begin
  update public.sessions set recording_asset_id = p_asset, status = 'ended'
   where id = p_session returning batch_id, title into bid, t;
  if bid is null then raise exception 'Unknown session' using errcode = 'P0002'; end if;
  insert into public.notifications (user_id, kind, ref_id, title, body)
  select e.student_id, 'recording', p_session, 'Recording ready: ' || t, 'Watch it any time in your batch.'
  from public.enrollments e where e.batch_id = bid and e.status = 'active'
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Queue reminders for classes starting within the next p_hours (run hourly). Never duplicates.
create function public.queue_session_reminders(p_hours int default 24, p_now timestamptz default now()) returns int
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
  on conflict (user_id, kind, ref_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================================
-- Dashboards
-- ============================================================================
-- Everything a student's portal shows, for their active batches only.
create function public.my_dashboard(p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'profile', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role)
                from public.profiles p where p.id = uid),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'code', b.code, 'program_id', b.program_id, 'program', pr.name,
        'starts_on', b.starts_on, 'ends_on', b.ends_on, 'status', b.status, 'timezone', b.timezone,
        'lessons_total', (select count(*) from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = b.program_id),
        'lessons_completed', (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
                              join public.modules m on m.id = l.module_id
                              where m.program_id = b.program_id and lp.student_id = uid and lp.completed_at is not null),
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
                          where s.batch_id = b.id and a.student_id = uid),
             'held', (select count(*) from public.sessions s where s.batch_id = b.id and s.ends_at <= p_now and s.status <> 'cancelled')),
        'assignments', coalesce((select jsonb_agg(jsonb_build_object(
             'id', a.id, 'title', a.title, 'due_at', a.due_at,
             'status', coalesce(sub.status, case when a.due_at < p_now then 'overdue' else 'not_started' end),
             'grade', sub.grade, 'attempt', sub.attempt,
             'late', sub.submitted_at is not null and sub.submitted_at > a.due_at) order by a.due_at)
           from public.batch_assignments a
           left join public.submissions sub on sub.assignment_id = a.id and sub.student_id = uid
           where a.batch_id = b.id), '[]'::jsonb)
      ) order by b.starts_on)
      from public.enrollments e
      join public.batches b on b.id = e.batch_id
      join public.programs pr on pr.id = b.program_id
      where e.student_id = uid and e.status = 'active'), '[]'::jsonb),
    'continue_watching', coalesce((select jsonb_agg(jsonb_build_object(
        'lesson_id', l.id, 'code', l.code, 'title', l.title, 'last_position', lp.last_position,
        'duration', l.duration_seconds, 'percent', round(100.0 * lp.watched_seconds / nullif(l.duration_seconds, 0))) order by lp.updated_at desc)
      from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
      where lp.student_id = uid and lp.completed_at is null and lp.watched_seconds > 0), '[]'::jsonb),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = uid and n.read_at is null)
  ) into result;
  return result;
end $$;

-- Students with no learning activity for p_days, for admins (all batches) or staff (their batches).
create function public.staff_at_risk(p_days int default 14, p_now timestamptz default now())
returns table (student_id uuid, full_name text, email text, batch_code text, last_active_at timestamptz, days_inactive int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  perform public.require_staff();
  return query
    select p.id, p.full_name, p.email, b.code,
           coalesce(p.last_active_at, e.enrolled_at),
           floor(extract(epoch from (p_now - coalesce(p.last_active_at, e.enrolled_at))) / 86400)::int
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    join public.batches b on b.id = e.batch_id
    where e.status = 'active' and b.status in ('scheduled','active')
      and coalesce(p.last_active_at, e.enrolled_at) < p_now - make_interval(days => p_days)
      and (public.is_admin() or public.teaches(b.id))
    order by 6 desc;
end $$;

-- ============================================================================
-- Who may call what
-- ============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- Helpers used inside security rules must be callable by signed-in users.
grant execute on function public.is_admin(), public.my_active_batches(), public.teaches(uuid), public.can_see_batch(uuid)
  to authenticated;
grant execute on function public.first_monday(date), public.next_start_date(date) to anon, authenticated;

-- Student and staff actions.
grant execute on function
  public.record_progress(uuid, int, int, int),
  public.mark_reading_done(uuid),
  public.submit_assignment(uuid, text, text, text),
  public.grade_submission(uuid, text, text),
  public.my_dashboard(timestamptz),
  public.staff_at_risk(int, timestamptz),
  public.admin_create_batch(text, date),
  public.admin_enroll(text, text, date),
  public.admin_transfer(uuid, uuid),
  public.admin_set_enrollment_status(uuid, text),
  public.admin_set_role(uuid, text),
  public.admin_assign_staff(uuid, uuid, text),
  public.require_admin()
  to authenticated;

-- Internal automation: server-side only.
grant execute on function
  public.create_batch(text, date),
  public.create_monthly_batches(date),
  public.update_batch_statuses(date),
  public.enroll_student(uuid, text, date, text, text),
  public.record_attendance(uuid, text, timestamptz, timestamptz),
  public.attach_recording(uuid, text),
  public.queue_session_reminders(int, timestamptz)
  to service_role;
