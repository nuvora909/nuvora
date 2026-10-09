-- Nuvora core schema
-- Programs hold the curriculum template; a batch is one dated run of a program; enrollments link
-- students to batches. Row-level security makes every student see only their own active batches.

-- ============================================================================
-- Profiles (one per signed-up user)
-- ============================================================================
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  role           text not null default 'student' check (role in ('student','instructor','admin')),
  last_active_at timestamptz,
  created_at     timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================================
-- Catalog and curriculum templates
-- ============================================================================
create table public.programs (
  id             text primary key,                                   -- e.g. 'bs-aiml'
  name           text not null,
  level          text not null check (level in ('Bachelor','Master','Certificate')),
  credits        int  not null check (credits > 0),
  duration_weeks int  not null default 12 check (duration_weeks between 1 and 104),
  timezone       text not null default 'Asia/Kolkata',
  capacity       int  not null default 60 check (capacity > 0),
  active         boolean not null default true
);

create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  program_id text not null references public.programs(id) on delete cascade,
  position   int  not null,
  title      text not null,
  unique (program_id, position)
);

create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules(id) on delete cascade,
  position         int  not null,
  code             text not null,
  title            text not null,
  kind             text not null default 'video' check (kind in ('video','reading')),
  video_asset_id   text,                                             -- id at the protected video host
  duration_seconds int  not null default 0 check (duration_seconds >= 0),
  unique (module_id, position)
);

-- Live classes, relative to a batch's first Monday: week 1..n, ISO weekday 1 (Mon)..7 (Sun).
create table public.session_templates (
  id               uuid primary key default gen_random_uuid(),
  program_id       text not null references public.programs(id) on delete cascade,
  week             int  not null check (week between 1 and 104),
  weekday          int  not null check (weekday between 1 and 7),
  start_time       time not null,
  duration_minutes int  not null default 60 check (duration_minutes between 15 and 480),
  title            text not null,
  lesson_id        uuid references public.lessons(id) on delete set null
);

-- Assignments and projects, due N days after the batch starts (23:59 batch time).
create table public.assignment_templates (
  id              uuid primary key default gen_random_uuid(),
  program_id      text not null references public.programs(id) on delete cascade,
  title           text not null,
  instructions    text not null default '',
  due_offset_days int  not null check (due_offset_days >= 0),
  lesson_id       uuid references public.lessons(id) on delete set null
);

-- ============================================================================
-- Batches and people
-- ============================================================================
create table public.batches (
  id         uuid primary key default gen_random_uuid(),
  program_id text not null references public.programs(id),
  code       text not null unique,                                   -- e.g. 'BSAIML-2026-10'
  starts_on  date not null,
  ends_on    date not null,
  timezone   text not null,
  capacity   int  not null check (capacity > 0),
  status     text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique (program_id, starts_on),
  check (ends_on >= starts_on)
);

create table public.batch_staff (
  batch_id uuid not null references public.batches(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  role     text not null default 'instructor' check (role in ('instructor','mentor','coach')),
  primary key (batch_id, user_id)
);

create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  batch_id    uuid not null references public.batches(id),
  program_id  text not null references public.programs(id),
  status      text not null default 'active' check (status in ('active','paused','completed','withdrawn')),
  source      text not null default 'admin' check (source in ('payment','admin','transfer')),
  payment_ref text,
  enrolled_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, batch_id)
);
-- One active enrollment per student per program, and one enrollment per payment.
create unique index enrollments_one_active_per_program on public.enrollments (student_id, program_id) where status = 'active';
create unique index enrollments_payment_ref on public.enrollments (payment_ref) where payment_ref is not null;
create index enrollments_batch on public.enrollments (batch_id);

-- ============================================================================
-- What a batch runs: live sessions and dated assignments
-- ============================================================================
create table public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references public.batches(id) on delete cascade,
  template_id        uuid references public.session_templates(id) on delete set null,
  title              text not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  join_url           text,
  recording_asset_id text,
  status             text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  check (ends_at > starts_at)
);
create index sessions_batch_start on public.sessions (batch_id, starts_at);

create table public.batch_assignments (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.batches(id) on delete cascade,
  template_id  uuid references public.assignment_templates(id) on delete set null,
  title        text not null,
  instructions text not null default '',
  due_at       timestamptz not null,
  unique (batch_id, template_id)
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.batch_assignments(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  attempt       int  not null default 1,
  status        text not null default 'submitted' check (status in ('submitted','needs_resubmission','graded')),
  link_url      text,
  file_path     text,
  note          text,
  submitted_at  timestamptz not null default now(),
  grade         text check (grade in ('distinguished','proficient','basic','not_yet')),
  feedback      text,
  graded_by     uuid references public.profiles(id),
  graded_at     timestamptz,
  unique (assignment_id, student_id),
  check (link_url is not null or file_path is not null)
);

-- Watch progress: one flag per 10-second slice of the video, so skipping ahead never counts as watched.
create table public.lesson_progress (
  student_id      uuid not null references public.profiles(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  watched         boolean[] not null default '{}',
  watched_seconds int  not null default 0,
  last_position   int  not null default 0,
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create table public.attendance (
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  first_joined_at timestamptz not null,
  minutes    int  not null default 0,
  primary key (session_id, student_id)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  ref_id     uuid,
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  emailed_at timestamptz,
  unique (user_id, kind, ref_id)
);

-- ============================================================================
-- Helpers used by security rules (run as their owner, read-only)
-- ============================================================================
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.my_active_batches() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select batch_id from public.enrollments where student_id = auth.uid() and status = 'active'
$$;

create function public.teaches(p_batch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.batch_staff where batch_id = p_batch and user_id = auth.uid())
$$;

create function public.can_see_batch(p_batch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or public.teaches(p_batch)
      or exists (select 1 from public.enrollments
                 where student_id = auth.uid() and batch_id = p_batch and status = 'active')
$$;

-- ============================================================================
-- Row-level security
-- ============================================================================
alter table public.profiles             enable row level security;
alter table public.programs             enable row level security;
alter table public.modules              enable row level security;
alter table public.lessons              enable row level security;
alter table public.session_templates    enable row level security;
alter table public.assignment_templates enable row level security;
alter table public.batches              enable row level security;
alter table public.batch_staff          enable row level security;
alter table public.enrollments          enable row level security;
alter table public.sessions             enable row level security;
alter table public.batch_assignments    enable row level security;
alter table public.submissions          enable row level security;
alter table public.lesson_progress      enable row level security;
alter table public.attendance           enable row level security;
alter table public.notifications        enable row level security;

-- Nobody gets anything unless granted below.
revoke all on all tables in schema public from anon, authenticated;

-- Public catalog (the website can list programs and syllabi without signing in).
grant select on public.programs, public.modules to anon, authenticated;
-- Video ids stay server-side: playback is authorised per student by the video service, never by id alone.
grant select (id, module_id, position, code, title, kind, duration_seconds) on public.lessons to anon, authenticated;
create policy catalog_programs_public on public.programs for select to anon using (active);
create policy catalog_programs on public.programs for select to authenticated using (active or public.is_admin());
create policy catalog_modules  on public.modules  for select using (true);
create policy catalog_lessons  on public.lessons  for select using (true);

grant select on public.session_templates, public.assignment_templates to authenticated;
create policy templates_sessions    on public.session_templates    for select using (public.is_admin());
create policy templates_assignments on public.assignment_templates for select using (public.is_admin());

-- Profiles: yourself, the students you teach, or everyone if admin. Users may only edit their name.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select using (
  id = auth.uid() or public.is_admin()
  or exists (select 1 from public.enrollments e join public.batch_staff s on s.batch_id = e.batch_id
             where e.student_id = profiles.id and s.user_id = auth.uid())
);
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Batches and everything inside them: only people enrolled (active), their staff, or admins.
grant select on public.batches, public.batch_staff, public.enrollments,
                public.batch_assignments, public.submissions, public.lesson_progress, public.attendance
  to authenticated;
-- Jitsi links and recording ids are not readable directly: my_sessions() hands out a join link only
-- from 15 minutes before a class until it ends, so links cannot be collected and shared in advance.
grant select (id, batch_id, template_id, title, starts_at, ends_at, status) on public.sessions to authenticated;
create policy batches_read     on public.batches           for select using (public.can_see_batch(id));
create policy staff_read       on public.batch_staff       for select using (public.can_see_batch(batch_id));
create policy sessions_read    on public.sessions          for select using (public.can_see_batch(batch_id));
create policy assignments_read on public.batch_assignments for select using (public.can_see_batch(batch_id));
create policy enrollments_read on public.enrollments       for select using (
  student_id = auth.uid() or public.is_admin() or public.teaches(batch_id));
create policy submissions_read on public.submissions for select using (
  student_id = auth.uid() or public.is_admin()
  or public.teaches((select a.batch_id from public.batch_assignments a where a.id = submissions.assignment_id)));
create policy progress_read on public.lesson_progress for select using (
  student_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.enrollments e join public.batch_staff s on s.batch_id = e.batch_id
             where e.student_id = lesson_progress.student_id and s.user_id = auth.uid()));
create policy attendance_read on public.attendance for select using (
  student_id = auth.uid() or public.is_admin()
  or public.teaches((select s.batch_id from public.sessions s where s.id = attendance.session_id)));

grant select, update (read_at) on public.notifications to authenticated;
create policy notifications_own_read   on public.notifications for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Server-side jobs (webhooks, schedulers) use the service role and bypass RLS by design.
grant all on all tables in schema public to service_role;

