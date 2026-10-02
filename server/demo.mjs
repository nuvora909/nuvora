// Demo scenario for the local server: a batch in progress with real-looking activity, built through the
// same database functions production uses (enrollment, submissions, grading, recordings).
// Dates are relative to today, so there are always past classes, upcoming classes and due dates.
import { randomUUID } from 'node:crypto';
import { runAs } from './localdb.mjs';
import { hashPassword } from './auth.mjs';
import { ACCOUNTS, DEMO_PASSWORD } from './demo-accounts.mjs';

export async function loadDemo(db) {
  const service = (sql, params) => runAs(db, 'service_role', { role: 'service_role' }, sql, params);
  const as = (id) => (sql, params) => runAs(db, 'authenticated', { sub: id, role: 'authenticated' }, sql, params);
  const one = async (p) => { const r = await p; return r.rows[0] ? Object.values(r.rows[0])[0] : undefined; };

  // The current batch started on a first Monday at least two weeks ago; the next one starts the month after.
  const current = await one(db.query(`select (case when first_monday(current_date) <= current_date - 14
                                                   then first_monday(current_date)
                                                   else first_monday((current_date - interval '1 month')::date) end)::text`));
  const next = await one(db.query(`select first_monday(($1::date + interval '1 month')::date)::text`, [current]));

  const batch = {
    current: await one(service(`select create_batch('bs-aiml', $1)`, [current])),
    next: await one(service(`select create_batch('bs-aiml', $1)`, [next])),
    otherProgram: await one(service(`select create_batch('ms-ds', $1)`, [current])),
  };
  await service(`select update_batch_statuses(current_date)`);

  const hash = await hashPassword(DEMO_PASSWORD);
  const id = {};
  for (const [key, a] of Object.entries(ACCOUNTS)) {
    id[key] = randomUUID();
    await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
                    values ($1, $2, $3, $4, now())`, [id[key], a.email, hash, { full_name: a.name }]);
    if (a.role !== 'student') await db.query(`update public.profiles set role = $2 where id = $1`, [id[key], a.role]);
  }

  for (const s of ['student', 'classmate']) await service(`select enroll_student($1, 'bs-aiml', $2)`, [id[s], current]);
  await service(`select enroll_student($1, 'bs-aiml', $2)`, [id.nextBatch, next]);
  await service(`select enroll_student($1, 'ms-ds', $2)`, [id.otherProgram, current]);
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [batch.current, id.instructor]);
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [batch.next, id.instructor2]);
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [batch.otherProgram, id.instructor2]);

  // Placeholder Zoom links (not real meetings).
  await db.query(`update public.sessions s set join_url = 'https://zoom.us/j/9' || lpad(n::text, 9, '0')
                  from (select id, row_number() over (order by starts_at, id) n from public.sessions) x where x.id = s.id`);

  // Maya: first three lessons finished, the fourth 40% watched.
  const lessons = (await db.query(`select l.id, l.duration_seconds d from public.lessons l join public.modules m on m.id = l.module_id
                                   where m.program_id = 'bs-aiml' order by m.position, l.position`)).rows;
  for (const [i, l] of lessons.slice(0, 4).entries()) {
    const buckets = Math.ceil(l.d / 10);
    const done = i < 3;
    const watched = done ? buckets : Math.floor(buckets * 0.4);
    await db.query(`insert into public.lesson_progress (student_id, lesson_id, watched, watched_seconds, last_position, completed_at, updated_at)
                    values ($1, $2, array_fill(true, array[$3::int]) || array_fill(false, array[$4::int]), $5, $6,
                            case when $7 then now() - make_interval(days => 6 - $8) end, now() - make_interval(days => 6 - $8))`,
                    [id.student, l.id, watched, buckets - watched, Math.min(l.d, watched * 10), done ? l.d : watched * 10, done, i]);
  }

  // Past classes: attendance for both students, recordings for the live classes (newest two announced).
  const past = (await db.query(`select id, title, starts_at, ends_at from public.sessions
                                where batch_id = $1 and ends_at < now() order by starts_at`, [batch.current])).rows;
  for (const [i, s] of past.entries()) {
    if (i !== 1) await db.query(`insert into public.attendance (session_id, student_id, first_joined_at, minutes)
                                 values ($1, $2, $3, $4)`, [s.id, id.student, s.starts_at, s.title.startsWith('Live') ? 58 : 40]);
    if (i % 3 === 0) await db.query(`insert into public.attendance (session_id, student_id, first_joined_at, minutes)
                                     values ($1, $2, $3, 35)`, [s.id, id.classmate, s.starts_at]);
  }
  const liveClasses = past.filter((s) => s.title.startsWith('Live'));
  for (const [i, s] of liveClasses.entries()) {
    if (i >= liveClasses.length - 2) await service(`select attach_recording($1, $2)`, [s.id, `demo-recording-${i + 1}`]);
    else await db.query(`update public.sessions set recording_asset_id = $2, status = 'ended' where id = $1`, [s.id, `demo-recording-${i + 1}`]);
  }

  // Assignments: Maya passed project 1 after one resubmission; Leo's project 1 is waiting to be graded.
  const [p1] = (await db.query(`select id from public.batch_assignments where batch_id = $1 order by due_at`, [batch.current])).rows.map((r) => r.id);
  await as(id.student)(`select submit_assignment($1, 'https://github.com/maya-demo/churn-model', null, 'Notebook and README in the repo.')`, [p1]);
  let sub = await one(db.query(`select id from public.submissions where assignment_id = $1 and student_id = $2`, [p1, id.student]));
  await as(id.instructor)(`select grade_submission($1, 'basic', 'Good start. Add a baseline model and evaluate on a held-out set.')`, [sub]);
  await as(id.student)(`select submit_assignment($1, 'https://github.com/maya-demo/churn-model', null, 'Added a baseline and a held-out evaluation.')`, [p1]);
  await as(id.instructor)(`select grade_submission($1, 'proficient', 'Clear improvement: the baseline comparison makes the result convincing.')`, [sub]);
  await as(id.classmate)(`select submit_assignment($1, 'https://github.com/leo-demo/churn', null, null)`, [p1]);
  // Realistic timing: both handed in before the due date; Maya's grade came a day later.
  await db.query(`update public.submissions s set submitted_at = least(now() - interval '1 day', a.due_at - interval '2 days'),
                    graded_at = case when s.graded_at is not null then least(now() - interval '1 hour', a.due_at - interval '1 day') end
                  from public.batch_assignments a where a.id = s.assignment_id and a.id = $1`, [p1]);

  // PDF materials: lecture notes for every lesson, an exercise sheet for the first two, and an assessment
  // brief for every project. (Locally the server generates the PDF content; in production admins upload it.)
  for (const program of ['bs-aiml', 'ms-ds']) {
    await db.query(`insert into public.materials (program_id, lesson_id, title, file_path, size_bytes, position)
                    select m.program_id, l.id, 'Lecture notes · ' || l.title, m.program_id || '/lessons/' || lower(l.code) || '/notes.pdf', 180000 + l.duration_seconds * 40, 1
                    from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = $1`, [program]);
    await db.query(`insert into public.materials (program_id, lesson_id, title, file_path, size_bytes, position)
                    select m.program_id, l.id, 'Exercise sheet · ' || l.title, m.program_id || '/lessons/' || lower(l.code) || '/exercises.pdf', 64000, 2
                    from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = $1
                    order by m.position, l.position limit 2`, [program]);
    await db.query(`insert into public.materials (program_id, assignment_template_id, title, file_path, size_bytes)
                    select program_id, id, 'Assessment brief · ' || title, program_id || '/assignments/' || row_number() over (order by due_offset_days) || '/brief.pdf', 96000
                    from public.assignment_templates where program_id = $1`, [program]);
  }
  await db.query(`insert into storage.objects (bucket_id, name, metadata)
                  select 'course-files', file_path, jsonb_build_object('title', title, 'mimetype', 'application/pdf', 'size', size_bytes)
                  from public.materials`);

  await db.query(`update public.profiles set last_active_at = now() - interval '1 day' where id = $1`, [id.student]);
  await db.query(`update public.profiles set last_active_at = now() - interval '19 days' where id = $1`, [id.classmate]);

  return { batch, id, starts: { current, next } };
}
