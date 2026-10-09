-- The student's learning path on the portal home: career goal and competency gaps, learning streak,
-- achievements and term skill badges, the next best action and today's targets.
--
-- Guardrails (kept in sync with the block at the top of the home page code, portal/js/pages/student.js):
--   * Rewards come only from verified learning events: watched video slices, completed lessons, submitted
--     and graded projects, attended live classes. Never from logins, clicks or time on a page.
--   * No points or XP, no leaderboards, no public ranking: everything here is the caller's own data only.
--   * No loss-aversion wording. Streaks forgive single rest days, and each student can switch them off;
--     when off, no streak number is sent to the browser at all.
--   * Anything that grants access or reveals something time-gated uses the server clock (now()), never
--     the caller's p_now: the Jitsi link rule lives in batch_summary_json and uses now(). p_now only shapes
--     what the student's own page displays (week, "due soon", streak day, the order of suggestions).
--   * Achievements and badges are derived from stored data; nothing is invented or counted twice. Each one
--     earned creates exactly one notification (unique user + kind + ref).

-- ============================================================================
-- Career goals: roles, the skills each uses (mapped to the lesson that teaches it), and the roles each
-- program prepares for (the first is the suggested goal). Seeded from web/data/careers.mjs and programs.mjs.
-- ============================================================================
create table public.career_roles (
  id       text primary key,
  title    text not null,
  summary  text not null default '',
  position int  not null
);
create table public.role_skills (
  role_id     text not null references public.career_roles(id) on delete cascade,
  position    int  not null,
  skill       text not null,
  lesson_code text not null,
  primary key (role_id, position)
);
create table public.program_roles (
  program_id text not null references public.programs(id) on delete cascade,
  role_id    text not null references public.career_roles(id) on delete cascade,
  position   int  not null,
  primary key (program_id, role_id)
);

-- The project that assesses a lesson's competency (project 1: lesson 1; project 2: lessons 2-3; the term
-- project: lesson 4). A skill counts as mastered when its lesson is complete and this project passed.
alter table public.lessons add column assessed_by uuid references public.assignment_templates(id) on delete set null;

alter table public.profiles
  add column goal_role   text references public.career_roles(id) on delete set null,
  add column show_streak boolean not null default true;

-- One row per student and calendar day (Asia/Kolkata) with verified learning, written only by the triggers
-- below: new watched slices, completed lessons, submitted projects, attended classes.
create table public.activity_days (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  day               date not null,
  watched_slices    int  not null default 0,
  lessons_completed int  not null default 0,
  submissions       int  not null default 0,
  classes_attended  int  not null default 0,
  primary key (user_id, day)
);

alter table public.career_roles  enable row level security;
alter table public.role_skills   enable row level security;
alter table public.program_roles enable row level security;
alter table public.activity_days enable row level security;
revoke all on public.career_roles, public.role_skills, public.program_roles, public.activity_days from anon, authenticated;
grant all on public.career_roles, public.role_skills, public.program_roles, public.activity_days to service_role;

-- ============================================================================
-- Helpers (internal)
-- ============================================================================
create function public.learning_day(p_at timestamptz) returns date
language sql stable as $$ select (p_at at time zone 'Asia/Kolkata')::date $$;

-- Stable ids for achievement notifications, so each one is sent once (unique user + kind + ref).
create function public.achievement_ref(p_program text, p_key text, p_term int default null) returns uuid
language sql immutable as $$ select md5(coalesce(p_program, '*') || '/' || p_key || '/' || coalesce(p_term::text, ''))::uuid $$;

-- Streak rule (forgiving): a run of active days may include single rest days, never two missed days in a
-- row. The streak is alive while the last active day is today or yesterday, and its length is the number of
-- calendar days from the run's first active day to its last. reached_7/reached_30: the active day on which
-- any run first spanned 7/30 days.
create function public.streak_of(p_days date[], p_today date) returns jsonb
language sql immutable as $$
  with d as (select distinct x as day from unnest(p_days) as x where x <= p_today),
  g as (select day, case when lag(day) over (order by day) >= day - 2 then 0 else 1 end as brk from d),
  r as (select day, sum(brk) over (order by day) as run from g),
  s as (select day, day - min(day) over (partition by run) + 1 as span from r)
  select jsonb_build_object(
    'current', coalesce((select span from s where day = (select max(day) from s) and day >= p_today - 1), 0),
    'alive', coalesce((select max(day) >= p_today - 1 from s), false),
    'active_today', exists (select 1 from s where day = p_today),
    'last_active', (select max(day) from s),
    'longest', coalesce((select max(span) from s), 0),
    'reached_7', (select min(day) from s where span >= 7),
    'reached_30', (select min(day) from s where span >= 30))
$$;

-- Add verified learning to a student's day. Returns true when it is the first activity of that day.
create function public.log_activity(p_user uuid, p_day date, p_slices int, p_lessons int, p_submissions int, p_classes int)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare fresh boolean;
begin
  insert into public.activity_days as a (user_id, day, watched_slices, lessons_completed, submissions, classes_attended)
  values (p_user, p_day, p_slices, p_lessons, p_submissions, p_classes)
  on conflict (user_id, day) do update
    set watched_slices    = a.watched_slices + excluded.watched_slices,
        lessons_completed = a.lessons_completed + excluded.lessons_completed,
        submissions       = a.submissions + excluded.submissions,
        classes_attended  = a.classes_attended + excluded.classes_attended
  returning (xmax = 0) into fresh;
  return fresh;
end $$;

-- ============================================================================
-- Achievements and skill badges (derived; nothing stored but the notifications)
-- ============================================================================
-- The student's achievements in one program, earned or not yet, in display order. Term completion is
-- listed for completed terms and the current one; streak achievements only while streaks are switched on.
create function public.achievements_json(p_user uuid, p_program text, p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with
  mine as (select b.id, b.term_no, b.starts_on, b.timezone, e.status as enrollment_status, e.updated_at as enrollment_updated
           from public.enrollments e join public.batches b on b.id = e.batch_id
           where e.student_id = p_user and e.program_id = p_program and e.status in ('active','completed')),
  subs as (select s.* from public.submissions s join public.batch_assignments a on a.id = s.assignment_id
           where s.student_id = p_user and a.batch_id in (select id from mine)),
  done as (select lp.completed_at from public.lesson_progress lp
           join public.lessons l on l.id = lp.lesson_id join public.modules m on m.id = l.module_id
           where lp.student_id = p_user and m.program_id = p_program and lp.completed_at is not null),
  -- Weeks of a batch that are over and in which the student attended every class and office hour.
  weeks as (select max(s.ends_at) as week_end
            from mine b join public.sessions s on s.batch_id = b.id and s.status <> 'cancelled'
            left join public.attendance a on a.session_id = s.id and a.student_id = p_user
            group by b.id, ((s.starts_at at time zone b.timezone)::date - b.starts_on) / 7
            having count(*) = count(a.session_id) and max(s.ends_at) <= p_now),
  streak as (select public.streak_of(array(select day from public.activity_days where user_id = p_user),
                                     public.learning_day(p_now)) as s),
  cur as (select coalesce((select max(term_no) from mine where enrollment_status = 'active'), (select max(term_no) from mine), 1) as n),
  items (pos, key, term, title, description, earned_on) as (
    select 1, 'first_lesson', null::int, 'First lesson complete', 'A lesson completed: 90% watched, or a reading finished.',
           public.learning_day((select min(completed_at) from done))
    union all
    select 2, 'first_project', null, 'First project passed', 'A project graded Proficient or Distinguished.',
           public.learning_day((select min(graded_at) from subs where grade in ('proficient','distinguished')))
    union all
    select 3, 'distinguished', null, 'Distinguished work', 'A project graded Distinguished, the top level of the rubric.',
           public.learning_day((select min(graded_at) from subs where grade = 'distinguished'))
    union all
    select 4, 'revised_to_mastery', null, 'Revised to mastery', 'A project passed after revising it with your instructor’s feedback.',
           public.learning_day((select min(graded_at) from subs where attempt > 1 and grade in ('proficient','distinguished')))
    union all
    select 5, 'full_week', null, 'Full week of live classes', 'Every live class and office hour of a week attended.',
           public.learning_day((select min(week_end) from weeks))
    union all
    select 6, 'streak_7', null, '7-day learning streak', 'Learning on a run of 7 days, with no two days missed in a row.',
           ((select s from streak)->>'reached_7')::date
    union all
    select 7, 'streak_30', null, '30-day learning streak', 'Learning on a run of 30 days, with no two days missed in a row.',
           ((select s from streak)->>'reached_30')::date
    union all
    select 10 + t.term_no, 'term_complete', t.term_no, 'Term ' || t.term_no || ' complete', 'Term ' || t.term_no || ': ' || t.title || ' completed.',
           public.learning_day((select min(enrollment_updated) from mine where term_no = t.term_no and enrollment_status = 'completed'))
    from public.program_terms t where t.program_id = p_program and t.term_no <= (select n from cur)
    union all
    select 100, 'program_complete', null, 'Program complete', 'Every term of ' || (select name from public.programs where id = p_program) || ' completed.',
           public.learning_day((select min(enrollment_updated) from mine where enrollment_status = 'completed'
                                and term_no = (select max(term_no) from public.program_terms where program_id = p_program)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', key, 'term', term, 'title', title, 'description', description,
           'earned', earned_on is not null, 'earned_on', earned_on,
           'kind', 'achievement', 'ref', public.achievement_ref(case when key like 'streak%' then null else p_program end, key, term))
         order by pos), '[]'::jsonb)
  from items
  where key not like 'streak%' or (select show_streak from public.profiles where id = p_user)
$$;

-- One skill badge per term, earned when every lesson of the term is complete and every project of the
-- student's batch for that term passed (Proficient or Distinguished).
create function public.badges_json(p_user uuid, p_program text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'term', t.term_no, 'term_title', t.title, 'title', t.badge,
           'description', 'Every lesson of Term ' || t.term_no || ' complete and all its projects passed.',
           'earned', w.earned_at is not null, 'earned_on', public.learning_day(w.earned_at),
           'kind', 'badge', 'ref', public.achievement_ref(p_program, 'badge', t.term_no))
         order by t.term_no), '[]'::jsonb)
  from public.program_terms t
  left join lateral (
    select min(greatest(
             (select max(lp.completed_at) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
              join public.modules m on m.id = l.module_id
              where lp.student_id = p_user and m.program_id = p_program and m.term_no = t.term_no),
             (select max(s.graded_at) from public.batch_assignments a join public.submissions s on s.assignment_id = a.id
              where a.batch_id = b.id and s.student_id = p_user))) as earned_at
    from public.enrollments e join public.batches b on b.id = e.batch_id
    where e.student_id = p_user and e.program_id = p_program and b.term_no = t.term_no
      and e.status in ('active','completed') and public.term_requirements_met(p_user, b.id)) w on true
  where t.program_id = p_program
$$;

-- Notify the student once about each achievement and badge earned (by the real clock). Called by the
-- learning-event triggers below and safe to call any number of times.
create function public.award_achievements(p_user uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare p text; n int; made int := 0;
begin
  for p in select distinct program_id from public.enrollments where student_id = p_user and status in ('active','completed') loop
    insert into public.notifications (user_id, kind, ref_id, title, body)
    select p_user, x->>'kind', (x->>'ref')::uuid,
           case when x->>'kind' = 'badge' then 'Skill badge earned: ' else 'Achievement: ' end || (x->>'title'),
           x->>'description'
    from jsonb_array_elements(public.achievements_json(p_user, p, now()) || public.badges_json(p_user, p)) as x
    where (x->>'earned')::boolean
    on conflict (user_id, kind, ref_id) do nothing;
    get diagnostics n = row_count;
    made := made + n;
  end loop;
  return made;
end $$;

-- ============================================================================
-- Verified learning events -> activity days and achievements
-- ============================================================================
create function public.on_lesson_progress() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  added    int := (select count(*) from unnest(new.watched) as x where x)
                  - case when tg_op = 'UPDATE' then (select count(*) from unnest(old.watched) as x where x) else 0 end;
  finished boolean := new.completed_at is not null and (tg_op = 'INSERT' or old.completed_at is null);
begin
  -- Re-watching parts already watched adds nothing.
  if added <= 0 and not finished then return new; end if;
  if public.log_activity(new.student_id, public.learning_day(new.updated_at), greatest(added, 0), case when finished then 1 else 0 end, 0, 0)
     or finished then
    perform public.award_achievements(new.student_id);
  end if;
  return new;
end $$;
create trigger lesson_progress_activity after insert or update on public.lesson_progress
  for each row execute function public.on_lesson_progress();

create function public.on_submission() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.attempt > old.attempt then
    perform public.log_activity(new.student_id, public.learning_day(new.submitted_at), 0, 0, 1, 0);
  end if;
  if new.grade is not null and (tg_op = 'INSERT' or old.grade is distinct from new.grade or old.graded_at is distinct from new.graded_at) then
    perform public.award_achievements(new.student_id);
  end if;
  return new;
end $$;
create trigger submission_activity after insert or update on public.submissions
  for each row execute function public.on_submission();

create function public.on_attendance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.log_activity(new.student_id, public.learning_day(new.first_joined_at), 0, 0, 0, case when tg_op = 'INSERT' then 1 else 0 end);
  perform public.award_achievements(new.student_id);
  return new;
end $$;
create trigger attendance_activity after insert or update of minutes on public.attendance
  for each row execute function public.on_attendance();

create function public.on_enrollment_completed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.award_achievements(new.student_id);
  end if;
  return new;
end $$;
create trigger enrollment_completed after insert or update of status on public.enrollments
  for each row execute function public.on_enrollment_completed();

-- ============================================================================
-- Competency gaps for a career goal
-- ============================================================================
-- For each skill of the role: where the student's program teaches it (term and lesson) and how far they
-- are: mastered (lesson complete and its project passed), needs_work (project graded Basic or Not yet),
-- in_progress, not_started; or not_in_program, with the programs that do teach it.
create function public.gaps_json(p_user uuid, p_program text, p_role text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'skill', rs.skill, 'lesson_code', rs.lesson_code,
           'lesson_id', l.id, 'lesson_title', l.title, 'term', l.term_no,
           'available', l.id is not null and public.term_open(p_user, p_program, l.term_no),
           'completed', lp.completed_at is not null,
           'status', case when l.id is null then 'not_in_program'
                          when lp.completed_at is not null and pj.passed then 'mastered'
                          when pj.needs_work then 'needs_work'
                          when lp.completed_at is not null or coalesce(lp.watched_seconds, 0) > 0 or pj.submitted then 'in_progress'
                          else 'not_started' end,
           'programs', case when l.id is null then coalesce((
               select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.id)
               from public.programs p
               where p.active and exists (select 1 from public.lessons x join public.modules mx on mx.id = x.module_id
                                          where mx.program_id = p.id and x.code = rs.lesson_code)), '[]'::jsonb) end)
         order by rs.position), '[]'::jsonb)
  from public.role_skills rs
  left join lateral (select x.id, x.title, x.assessed_by, mx.term_no
                     from public.lessons x join public.modules mx on mx.id = x.module_id
                     where mx.program_id = p_program and x.code = rs.lesson_code
                     order by mx.term_no limit 1) l on true
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = p_user
  left join lateral (select coalesce(bool_or(s.grade in ('proficient','distinguished')), false) as passed,
                            coalesce(bool_or(s.status = 'needs_resubmission'), false) as needs_work,
                            coalesce(bool_or(s.status = 'submitted'), false) as submitted
                     from public.batch_assignments a
                     join public.submissions s on s.assignment_id = a.id and s.student_id = p_user
                     where a.template_id = l.assessed_by) pj on true
  where rs.role_id = p_role
$$;

-- ============================================================================
-- The home page
-- ============================================================================
-- Everything the student home shows, for one batch the caller may open (same check as my_course) and
-- only the caller's own data. Join links follow the real clock (batch_summary_json); p_now only shapes
-- the display: today, "due soon", the next action and the streak day.
create function public.my_home(p_batch uuid, p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid     uuid := auth.uid();
  b       public.batches;
  me      public.profiles;
  today   date := public.learning_day(p_now);
  goal    text;
  gaps    jsonb;
  nxt     jsonb;
  targets jsonb := '[]'::jsonb;
  r       record;
  cont    record;
  upnext  record;
begin
  b := public.portal_batch(p_batch);
  select * into me from public.profiles where id = uid;
  goal := coalesce(me.goal_role, (select role_id from public.program_roles where program_id = b.program_id order by position limit 1));
  gaps := public.gaps_json(uid, b.program_id, goal);

  -- The lesson in progress (most recent, current term first) and the next lesson not started yet.
  select l.id, l.title, public.lesson_percent(l.kind, l.duration_seconds, lp.watched_seconds, lp.completed_at) as pct into cont
  from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id join public.modules m on m.id = l.module_id
  where lp.student_id = uid and m.program_id = b.program_id and lp.completed_at is null and lp.watched_seconds > 0
    and public.term_open(uid, m.program_id, m.term_no)
  order by m.term_no = b.term_no desc, lp.updated_at desc limit 1;
  select l.id, l.title into upnext
  from public.lessons l join public.modules m on m.id = l.module_id
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = uid
  where m.program_id = b.program_id and m.term_no = b.term_no and lp.completed_at is null and coalesce(lp.watched_seconds, 0) = 0
  order by m.position, l.position limit 1;

  -- Next best action, in a fixed order of priority.
  select a.id, a.title, a.due_at, s.status into r
  from public.batch_assignments a left join public.submissions s on s.assignment_id = a.id and s.student_id = uid
  where a.batch_id = b.id and (s.status = 'needs_resubmission' or (s.id is null and a.due_at < p_now))
  order by a.due_at limit 1;
  if found then
    nxt := jsonb_build_object('kind', case when r.status = 'needs_resubmission' then 'resubmit' else 'overdue' end,
             'id', r.id, 'title', r.title, 'due_at', r.due_at,
             'reason', case when r.status = 'needs_resubmission'
                            then 'Your instructor reviewed it and asked for a revision. Resubmitting has no penalty.'
                            else 'It is past its due date. You can still submit it.' end);
  end if;
  if nxt is null then
    select s.id, s.title, s.starts_at, s.ends_at into r from public.sessions s
    where s.batch_id = b.id and s.status not in ('cancelled','ended') and s.ends_at > p_now and s.starts_at <= p_now + interval '24 hours'
    order by s.starts_at limit 1;
    if found then
      nxt := jsonb_build_object('kind', 'session', 'id', r.id, 'title', r.title, 'starts_at', r.starts_at,
               'reason', case when r.starts_at <= p_now then 'Your live class is on now.' else 'Your next live class starts within 24 hours.' end);
    end if;
  end if;
  if nxt is null and cont.id is not null then
    nxt := jsonb_build_object('kind', 'continue', 'id', cont.id, 'title', cont.title, 'percent', cont.pct,
             'reason', 'You are ' || cont.pct || '% of the way through this lesson.');
  end if;
  if nxt is null and upnext.id is not null then
    nxt := jsonb_build_object('kind', 'start', 'id', upnext.id, 'title', upnext.title, 'reason', 'The next lesson of Term ' || b.term_no || '.');
  end if;
  if nxt is null then
    select a.id, a.title, a.due_at into r
    from public.batch_assignments a left join public.submissions s on s.assignment_id = a.id and s.student_id = uid
    where a.batch_id = b.id and s.id is null and a.due_at >= p_now and a.due_at <= p_now + interval '7 days'
    order by a.due_at limit 1;
    if found then
      nxt := jsonb_build_object('kind', 'due_soon', 'id', r.id, 'title', r.title, 'due_at', r.due_at,
               'reason', 'Due within a week, and not submitted yet.');
    end if;
  end if;
  if nxt is null then
    select x->>'lesson_id' as id, x->>'lesson_title' as title, x->>'skill' as skill into r
    from jsonb_array_elements(gaps) with ordinality as g(x, n)
    where (x->>'available')::boolean and not (x->>'completed')::boolean
    order by case x->>'status' when 'needs_work' then 0 when 'in_progress' then 1 else 2 end, n limit 1;
    if found then
      nxt := jsonb_build_object('kind', 'gap', 'id', r.id, 'title', r.title,
               'reason', 'It builds “' || r.skill || '” for your goal: ' || (select title from public.career_roles where id = goal) || '.');
    end if;
  end if;
  nxt := coalesce(nxt, jsonb_build_object('kind', 'caught_up', 'id', null, 'title', 'You’re all caught up',
                                          'reason', 'Nothing is overdue and every lesson so far is complete.'));

  -- Today's targets: a lesson to finish, today's class, an assignment due soon (at most one of each).
  select l.id, l.title into r
  from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id join public.modules m on m.id = l.module_id
  where lp.student_id = uid and m.program_id = b.program_id and public.learning_day(lp.completed_at) = today
  order by lp.completed_at desc limit 1;
  if found then
    targets := targets || jsonb_build_object('kind', 'lesson', 'id', r.id, 'title', 'Finish ' || r.title, 'done', true);
  elsif cont.id is not null then
    targets := targets || jsonb_build_object('kind', 'lesson', 'id', cont.id, 'title', 'Finish ' || cont.title, 'done', false, 'percent', cont.pct);
  elsif upnext.id is not null then
    targets := targets || jsonb_build_object('kind', 'lesson', 'id', upnext.id, 'title', 'Start ' || upnext.title, 'done', false);
  end if;
  select s.id, s.title, s.starts_at,
         exists (select 1 from public.attendance a where a.session_id = s.id and a.student_id = uid) as attended into r
  from public.sessions s
  where s.batch_id = b.id and s.status <> 'cancelled' and (s.starts_at at time zone b.timezone)::date = (p_now at time zone b.timezone)::date
  order by s.starts_at limit 1;
  if found then
    targets := targets || jsonb_build_object('kind', 'session', 'id', r.id, 'title', 'Join ' || r.title, 'starts_at', r.starts_at, 'done', r.attended);
  end if;
  select a.id, a.title, a.due_at, s.status into r
  from public.batch_assignments a left join public.submissions s on s.assignment_id = a.id and s.student_id = uid
  where a.batch_id = b.id and coalesce(s.status, '') <> 'graded'
    and (s.status = 'needs_resubmission' or a.due_at <= p_now + interval '3 days')
  order by a.due_at limit 1;
  if found then
    targets := targets || jsonb_build_object('kind', 'assignment', 'id', r.id, 'due_at', r.due_at, 'done', coalesce(r.status = 'submitted', false),
                 'title', case when r.status = 'needs_resubmission' then 'Resubmit ' else 'Submit ' end || r.title);
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object('name', me.full_name, 'email', me.email, 'show_streak', me.show_streak, 'goal_role', me.goal_role),
    'today', today,
    'batch', public.batch_summary_json(b, uid, p_now),
    'path', jsonb_build_object(
      'lessons_total', (select count(*) from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = b.program_id),
      'lessons_completed', (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
                            join public.modules m on m.id = l.module_id
                            where m.program_id = b.program_id and lp.student_id = uid and lp.completed_at is not null),
      'terms', (select jsonb_agg(jsonb_build_object(
                  'term', t.term_no, 'title', t.title, 'badge', t.badge,
                  'status', case when t.term_no = b.term_no then 'current'
                                 when exists (select 1 from public.enrollments e join public.batches x on x.id = e.batch_id
                                              where e.student_id = uid and e.program_id = b.program_id and x.term_no = t.term_no
                                                and e.status = 'completed') then 'completed'
                                 when exists (select 1 from public.enrollments e join public.batches x on x.id = e.batch_id
                                              where e.student_id = uid and e.program_id = b.program_id and x.term_no = t.term_no
                                                and e.status = 'reserved') then 'reserved'
                                 else 'upcoming' end,
                  'starts_on', d.starts_on, 'ends_on', d.ends_on,
                  'lessons_total', (select count(*) from public.lessons l join public.modules m on m.id = l.module_id
                                    where m.program_id = b.program_id and m.term_no = t.term_no),
                  'lessons_completed', (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
                                        join public.modules m on m.id = l.module_id
                                        where m.program_id = b.program_id and m.term_no = t.term_no
                                          and lp.student_id = uid and lp.completed_at is not null))
                  order by t.term_no)
                from public.program_terms t
                left join lateral (
                  select x.starts_on, x.ends_on from public.enrollments e join public.batches x on x.id = e.batch_id
                  where e.student_id = uid and e.program_id = b.program_id and x.term_no = t.term_no
                    and e.status in ('active','completed','reserved')
                  order by (x.id = b.id) desc, x.starts_on desc limit 1) d on true
                where t.program_id = b.program_id)),
    'goal', jsonb_build_object('role', goal, 'title', (select title from public.career_roles where id = goal),
                               'suggested', me.goal_role is null, 'skills', gaps),
    'roles', (select jsonb_agg(jsonb_build_object('id', cr.id, 'title', cr.title,
                                 'for_program', exists (select 1 from public.program_roles pr where pr.role_id = cr.id and pr.program_id = b.program_id))
                 order by cr.position)
              from public.career_roles cr),
    'streak', case when me.show_streak then
                public.streak_of(array(select day from public.activity_days where user_id = uid), today) end,
    'achievements', public.achievements_json(uid, b.program_id, p_now),
    'badges', public.badges_json(uid, b.program_id),
    'next_action', nxt,
    'targets', targets,
    'continue_watching', coalesce((select jsonb_agg(x order by o) from (
        select jsonb_build_object('lesson_id', l.id, 'code', l.code, 'title', l.title, 'last_position', lp.last_position,
                                  'duration', l.duration_seconds,
                                  'percent', public.lesson_percent(l.kind, l.duration_seconds, lp.watched_seconds, lp.completed_at)) as x,
               row_number() over (order by lp.updated_at desc) as o
        from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id join public.modules m on m.id = l.module_id
        where lp.student_id = uid and m.program_id = b.program_id and lp.completed_at is null and lp.watched_seconds > 0
          and public.term_open(uid, m.program_id, m.term_no)
        order by lp.updated_at desc limit 4) q), '[]'::jsonb));
end $$;

-- Choose a career goal (null goes back to the suggestion for the program).
create function public.set_my_goal(p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_role is not null and not exists (select 1 from public.career_roles where id = p_role) then
    raise exception 'Choose one of the listed goals' using errcode = '22023';
  end if;
  update public.profiles set goal_role = p_role where id = uid;
  return jsonb_build_object('goal_role', p_role, 'title', (select title from public.career_roles where id = p_role));
end $$;

-- Show or hide the learning streak (hidden: it is not even sent to the browser).
create function public.set_streak_visibility(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Choose on or off' using errcode = '22023'; end if;
  update public.profiles set show_streak = p_on where id = uid;
  return jsonb_build_object('show_streak', p_on);
end $$;

-- ============================================================================
-- Who may call what
-- ============================================================================
revoke execute on function
  public.learning_day(timestamptz),
  public.achievement_ref(text, text, int),
  public.streak_of(date[], date),
  public.log_activity(uuid, date, int, int, int, int),
  public.achievements_json(uuid, text, timestamptz),
  public.badges_json(uuid, text),
  public.award_achievements(uuid),
  public.on_lesson_progress(),
  public.on_submission(),
  public.on_attendance(),
  public.on_enrollment_completed(),
  public.gaps_json(uuid, text, text),
  public.my_home(uuid, timestamptz),
  public.set_my_goal(text),
  public.set_streak_visibility(boolean)
  from public, anon, authenticated;

grant execute on function public.my_home(uuid, timestamptz), public.set_my_goal(text), public.set_streak_visibility(boolean) to authenticated;
grant execute on function public.award_achievements(uuid) to service_role;

