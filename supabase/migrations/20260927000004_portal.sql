-- Nuvora portal: what each portal page reads, plus a few small self-service actions.
-- (Lesson and assignment pages include their PDF materials; see 20260927000003_materials.sql.)
-- The portal reads through these functions instead of raw tables, so every page gets exactly what it
-- needs and each call is checked against the caller: students see only batches they are actively
-- enrolled in, instructors only the batches they teach, admins everything.

-- ============================================================================
-- Internal helpers (not callable through the API)
-- ============================================================================
-- The batch if the caller may open it; otherwise "not found", never revealing whether it exists.
create function public.portal_batch(p_batch uuid) returns public.batches
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b public.batches;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into b from public.batches where id = p_batch;
  if not found or not public.can_see_batch(p_batch) then
    raise exception 'Batch not found' using errcode = 'P0002';
  end if;
  return b;
end $$;

-- Week of the course a batch is in (0 before it starts, capped at its last week), in the batch's time zone.
create function public.batch_week(b public.batches, p_now timestamptz default now()) returns int
language sql stable set search_path = public, pg_temp as $$
  select case when (p_now at time zone b.timezone)::date < b.starts_on then 0
              else least(((p_now at time zone b.timezone)::date - b.starts_on) / 7 + 1,
                         (b.ends_on - b.starts_on + 1) / 7) end
$$;

create function public.batch_json(b public.batches, p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'program_id', b.program_id,
    'program', (select name from public.programs where id = b.program_id),
    'starts_on', b.starts_on, 'ends_on', b.ends_on, 'status', b.status, 'timezone', b.timezone,
    'week', public.batch_week(b, p_now), 'weeks', (b.ends_on - b.starts_on + 1) / 7)
$$;

-- Watch percentage shown for a lesson.
create function public.lesson_percent(p_kind text, p_duration int, p_watched int, p_completed timestamptz) returns int
language sql immutable as $$
  select case when p_kind = 'reading' then (case when p_completed is not null then 100 else 0 end)
              when p_duration > 0 then least(100, round(100.0 * coalesce(p_watched, 0) / p_duration))::int
              else 0 end
$$;

-- ============================================================================
-- Student pages
-- ============================================================================
-- Course page: modules and lessons of the batch's program with the caller's progress.
create function public.my_course(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.batches;
begin
  b := public.portal_batch(p_batch);
  return jsonb_build_object(
    'batch', public.batch_json(b),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'position', m.position, 'title', m.title,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'code', l.code, 'title', l.title, 'kind', l.kind, 'duration', l.duration_seconds,
            'percent', public.lesson_percent(l.kind, l.duration_seconds, lp.watched_seconds, lp.completed_at),
            'completed', lp.completed_at is not null,
            'last_position', coalesce(lp.last_position, 0),
            'pdfs', (select count(*) from public.materials mt where mt.lesson_id = l.id)) order by l.position)
          from public.lessons l
          left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = uid
          where l.module_id = m.id), '[]'::jsonb)) order by m.position)
      from public.modules m where m.program_id = b.program_id), '[]'::jsonb));
end $$;

-- Lesson page: the lesson, the caller's progress, and its neighbours in the program.
-- Students need an active enrollment in the program; staff of one of its batches and admins may preview.
create function public.my_lesson(p_lesson uuid) returns jsonb
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
  select e.batch_id into bid from public.enrollments e
   where e.student_id = uid and e.program_id = m.program_id and e.status = 'active';
  enrolled := bid is not null;
  if not enrolled then
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
    where mm.program_id = m.program_id),
  cur as (select n from ordered where id = l.id)
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'title', l.title, 'kind', l.kind, 'duration', l.duration_seconds,
    'module', jsonb_build_object('id', m.id, 'position', m.position, 'title', m.title),
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

-- Live classes page. The Zoom link is included only from 15 minutes before a class until it ends,
-- judged by the server's clock.
create function public.my_sessions(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.batches;
begin
  b := public.portal_batch(p_batch);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
      'phase', case when s.status = 'cancelled' then 'cancelled'
                    when s.status = 'ended' or now() > s.ends_at then 'ended'
                    when now() < s.starts_at then 'upcoming'
                    else 'live' end,
      'join_opens_at', s.starts_at - interval '15 minutes',
      'join_url', case when s.status not in ('cancelled','ended')
                        and now() between s.starts_at - interval '15 minutes' and s.ends_at
                       then s.join_url end,
      'has_recording', s.recording_asset_id is not null,
      'attended_minutes', (select a.minutes from public.attendance a where a.session_id = s.id and a.student_id = uid))
      order by s.starts_at)
    from public.sessions s where s.batch_id = b.id), '[]'::jsonb);
end $$;

-- Assignments page: every assignment of the batch with the caller's submission, grade and feedback.
create function public.my_assignments(p_batch uuid, p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.batches;
begin
  b := public.portal_batch(p_batch);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'title', a.title, 'instructions', a.instructions, 'due_at', a.due_at,
      'materials', public.materials_json(null, a.template_id),
      'status', coalesce(s.status, case when a.due_at < p_now then 'overdue' else 'not_started' end),
      'submission', case when s.id is null then null else jsonb_build_object(
        'id', s.id, 'attempt', s.attempt, 'link_url', s.link_url, 'file_path', s.file_path, 'note', s.note,
        'submitted_at', s.submitted_at, 'late', s.submitted_at > a.due_at,
        'grade', s.grade, 'feedback', s.feedback, 'graded_at', s.graded_at) end)
      order by a.due_at)
    from public.batch_assignments a
    left join public.submissions s on s.assignment_id = a.id and s.student_id = uid
    where a.batch_id = b.id), '[]'::jsonb);
end $$;

create function public.my_notifications(p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = uid and read_at is null),
    'items', coalesce((
      select jsonb_agg(x order by rn) from (
        select jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
                                  'created_at', n.created_at, 'read', n.read_at is not null) as x,
               row_number() over (order by n.created_at desc, n.id) as rn
        from public.notifications n where n.user_id = uid
        order by n.created_at desc, n.id
        limit least(greatest(coalesce(p_limit, 30), 1), 100)) q), '[]'::jsonb));
end $$;

-- Mark one notification (or, with no id, all of them) as read. Only ever touches the caller's own.
create function public.mark_notifications_read(p_id uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
   where user_id = uid and read_at is null and (p_id is null or id = p_id);
  get diagnostics n = row_count;
  return n;
end $$;

create function public.update_my_profile(p_full_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v text;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  v := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if v ~ '[[:cntrl:]]' or char_length(v) < 2 or char_length(v) > 80 then
    raise exception 'Name must be 2 to 80 characters' using errcode = '22023';
  end if;
  update public.profiles set full_name = v where id = uid;
  return jsonb_build_object('name', v);
end $$;

-- ============================================================================
-- Staff pages (instructors: their batches; admins: all)
-- ============================================================================
create function public.staff_overview(p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_staff();
  return coalesce((
    select jsonb_agg(public.batch_json(b, p_now) || jsonb_build_object(
      'students', (select count(*) from public.enrollments e where e.batch_id = b.id and e.status = 'active'),
      'to_grade', (select count(*) from public.submissions s join public.batch_assignments a on a.id = s.assignment_id
                   where a.batch_id = b.id and s.status = 'submitted'),
      'next_session', (select jsonb_build_object('id', s.id, 'title', s.title, 'starts_at', s.starts_at,
                         'join_url', case when now() between s.starts_at - interval '15 minutes' and s.ends_at then s.join_url end)
                       from public.sessions s
                       where s.batch_id = b.id and s.ends_at > now() and s.status not in ('cancelled','ended')
                       order by s.starts_at limit 1))
      order by b.starts_on desc, b.code)
    from public.batches b
    where b.status in ('scheduled','active') and (public.is_admin() or public.teaches(b.id))), '[]'::jsonb);
end $$;

-- Submissions waiting for a grade, oldest first.
create function public.staff_grading_queue(p_batch uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'attempt', s.attempt, 'link_url', s.link_url, 'file_path', s.file_path, 'note', s.note,
      'submitted_at', s.submitted_at, 'late', s.submitted_at > a.due_at,
      'previous_feedback', case when s.attempt > 1 then s.feedback end,
      'assignment', jsonb_build_object('id', a.id, 'title', a.title, 'due_at', a.due_at),
      'batch', jsonb_build_object('id', b.id, 'code', b.code),
      'student', jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email))
      order by s.submitted_at, s.id)
    from public.submissions s
    join public.batch_assignments a on a.id = s.assignment_id
    join public.batches b on b.id = a.batch_id
    join public.profiles p on p.id = s.student_id
    where s.status = 'submitted'
      and (p_batch is null or b.id = p_batch)
      and (public.is_admin() or public.teaches(b.id))), '[]'::jsonb);
end $$;

-- Roster of one batch with each student's progress. Staff of that batch and admins only.
create function public.staff_roster(p_batch uuid, p_now timestamptz default now()) returns jsonb
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
    'lessons_total', (select count(*) from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = b.program_id),
    'sessions_held', (select count(*) from public.sessions s where s.batch_id = b.id and s.ends_at <= p_now and s.status <> 'cancelled'),
    'assignments_total', (select count(*) from public.batch_assignments a where a.batch_id = b.id),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'email', p.email, 'status', e.status, 'enrolled_at', e.enrolled_at,
        'last_active_at', p.last_active_at,
        'days_inactive', floor(extract(epoch from (p_now - coalesce(p.last_active_at, e.enrolled_at))) / 86400)::int,
        'lessons_completed', (select count(*) from public.lesson_progress lp
                              join public.lessons l on l.id = lp.lesson_id join public.modules m on m.id = l.module_id
                              where m.program_id = b.program_id and lp.student_id = p.id and lp.completed_at is not null),
        'attended', (select count(*) from public.attendance at join public.sessions s on s.id = at.session_id
                     where s.batch_id = b.id and at.student_id = p.id),
        'passed', (select count(*) from public.submissions s join public.batch_assignments a on a.id = s.assignment_id
                   where a.batch_id = b.id and s.student_id = p.id and s.status = 'graded'))
        order by lower(p.full_name), p.email)
      from public.enrollments e join public.profiles p on p.id = e.student_id
      where e.batch_id = b.id and e.status in ('active','paused')), '[]'::jsonb));
end $$;

-- ============================================================================
-- Who may call what. Supabase opens every new function to anon and authenticated by default,
-- so close all of them first, then open the portal functions to signed-in users only.
-- ============================================================================
revoke execute on function
  public.portal_batch(uuid),
  public.batch_week(public.batches, timestamptz),
  public.batch_json(public.batches, timestamptz),
  public.lesson_percent(text, int, int, timestamptz),
  public.my_course(uuid),
  public.my_lesson(uuid),
  public.my_sessions(uuid),
  public.my_assignments(uuid, timestamptz),
  public.my_notifications(int),
  public.mark_notifications_read(uuid),
  public.update_my_profile(text),
  public.staff_overview(timestamptz),
  public.staff_grading_queue(uuid),
  public.staff_roster(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.my_course(uuid),
  public.my_lesson(uuid),
  public.my_sessions(uuid),
  public.my_assignments(uuid, timestamptz),
  public.my_notifications(int),
  public.mark_notifications_read(uuid),
  public.update_my_profile(text),
  public.staff_overview(timestamptz),
  public.staff_grading_queue(uuid),
  public.staff_roster(uuid, timestamptz)
  to authenticated;
