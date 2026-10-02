-- Course materials: PDF files attached to lessons (notes, slides, exercises) and to assignments
-- (assessment briefs, rubrics, datasets described in PDF).
--
-- Rules:
--   * Only PDFs can be downloaded. Videos are never downloadable (they are streamed by the protected
--     video service), and the storage bucket accepts nothing but application/pdf.
--   * Files live in a PRIVATE storage bucket. A student gets a short-lived signed link only for files of a
--     program they are actively enrolled in; staff for programs they teach; admins for everything.
--   * Files are uploaded by admins (server side). Students and instructors cannot upload or change them.

create table public.materials (
  id                     uuid primary key default gen_random_uuid(),
  program_id             text not null references public.programs(id) on delete cascade,
  lesson_id              uuid references public.lessons(id) on delete cascade,
  assignment_template_id uuid references public.assignment_templates(id) on delete cascade,
  title                  text not null check (char_length(title) between 1 and 120),
  file_path              text not null unique,                   -- object name in the 'course-files' bucket
  size_bytes             int  not null default 0 check (size_bytes >= 0),
  position               int  not null default 1,
  created_at             timestamptz not null default now(),
  -- PDFs only, stored under the program's own folder: '<program>/<...>.pdf'
  check (file_path ~ '^[a-z0-9-]+/[A-Za-z0-9/_.-]+\.pdf$' and split_part(file_path, '/', 1) = program_id
         and file_path !~ '\.\.'),
  check (lesson_id is null or assignment_template_id is null)
);
create index materials_lesson on public.materials (lesson_id);
create index materials_assignment on public.materials (assignment_template_id);

alter table public.materials enable row level security;
revoke all on public.materials from anon, authenticated;     -- read through the portal functions only
grant all on public.materials to service_role;

-- May the caller download this file? Used by the storage policy below.
create function public.can_read_material(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.materials mt
    where mt.file_path = p_path
      and (public.is_admin()
           or exists (select 1 from public.enrollments e
                      where e.student_id = auth.uid() and e.program_id = mt.program_id and e.status = 'active')
           or exists (select 1 from public.batch_staff s join public.batches b on b.id = s.batch_id
                      where s.user_id = auth.uid() and b.program_id = mt.program_id)))
$$;
revoke execute on function public.can_read_material(text) from public, anon, authenticated;
grant execute on function public.can_read_material(text) to authenticated;

-- JSON list of materials for a lesson or an assignment template, in display order.
create function public.materials_json(p_lesson uuid, p_assignment_template uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'file_path', file_path, 'size_bytes', size_bytes)
                            order by position, title), '[]'::jsonb)
  from public.materials
  where (p_lesson is not null and lesson_id = p_lesson)
     or (p_assignment_template is not null and assignment_template_id = p_assignment_template)
$$;
revoke execute on function public.materials_json(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- Storage: a private, PDF-only bucket. Signed download links are issued only when the policy allows.
-- No insert/update/delete policies: only the service role (admin tools) can upload or replace files.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-files', 'course-files', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, allowed_mime_types = array['application/pdf'];

create policy course_files_read on storage.objects for select to authenticated
  using (bucket_id = 'course-files' and public.can_read_material(name));
