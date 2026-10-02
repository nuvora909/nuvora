// Demo scenario for the local server, built through the same database functions production uses
// (enrollment, submissions, grading, the daily term progression, recordings).
// Dates are relative to today, so there are always past classes, upcoming classes and due dates.
//
//   Maya (student)        B.S. AI & ML: finished term 1 last quarter, now in the current term-2 batch
//   Leo (classmate)       the same two batches as Maya; quiet for the last 19 days
//   Sara (nextBatch)      starts term 1 next month
//   Omar (otherProgram)   M.S. Data Science, term 1, same dates as Maya's batch
//   Nia (newcomer)        signed up, not enrolled
//   Elena (instructor)    teaches Maya's batches; Kofi (instructor2) the other two; plus an admin
import { randomUUID } from 'node:crypto';
import { runAs } from './localdb.mjs';
import { hashPassword } from './auth.mjs';
import { ACCOUNTS, DEMO_PASSWORD } from './demo-accounts.mjs';

export async function loadDemo(db) {
  const service = (sql, params) => runAs(db, 'service_role', { role: 'service_role' }, sql, params);
  const as = (id) => (sql, params) => runAs(db, 'authenticated', { sub: id, role: 'authenticated' }, sql, params);
  const one = async (p) => { const r = await p; return r.rows[0] ? Object.values(r.rows[0])[0] : undefined; };
  const rows = async (p) => (await p).rows;

  const hash = await hashPassword(DEMO_PASSWORD);
  const id = {};
  for (const [key, a] of Object.entries(ACCOUNTS)) {
    id[key] = randomUUID();
    await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
                    values ($1, $2, $3, $4, now())`, [id[key], a.email, hash, { full_name: a.name }]);
    if (a.role !== 'student') await db.query(`update public.profiles set role = $2 where id = $1`, [id[key], a.role]);
  }

  // ---------------------------------------------------------------- term 1 (finished last quarter)
  // The current batch started on a first Monday at least two weeks ago. Term 1 ran in the batch that started
  // three months before it, so the next term begins on the current batch's start date.
  const target = await one(db.query(`select (case when first_monday(current_date) <= current_date - 14
                                                  then first_monday(current_date)
                                                  else first_monday((current_date - interval '1 month')::date) end)::text`));
  const t1Start = await one(db.query(`select first_monday(($1::date - interval '3 months')::date)::text`, [target]));
  const term1 = await one(service(`select create_batch('bs-aiml', $1, 1)`, [t1Start]));
  const t1 = (await db.query(`select starts_on::text, ends_on::text from public.batches where id = $1`, [term1])).rows[0];
  const enrolledT1 = {};
  for (const s of ['student', 'classmate']) enrolledT1[s] = await one(service(`select enroll_student($1, 'bs-aiml', $2)`, [id[s], t1Start]));
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [term1, id.instructor]);

  // Every term-1 lesson finished, spread over the term.
  const lessonsOf = (term) => rows(db.query(`select l.id, l.duration_seconds d from public.lessons l join public.modules m on m.id = l.module_id
                                             where m.program_id = 'bs-aiml' and m.term_no = $1 order by l.position`, [term]));
  for (const [i, l] of (await lessonsOf(1)).entries()) {
    for (const [s, lag] of [['student', 0], ['classmate', 3]]) {
      const at = `${t1.starts_on} 20:00 Asia/Kolkata`;
      await db.query(`insert into public.lesson_progress (student_id, lesson_id, watched, watched_seconds, last_position, completed_at, updated_at)
                      values ($1, $2, array_fill(true, array[ceil($3 / 10.0)::int]), $3, $3,
                              $4::timestamptz + make_interval(days => $5), $4::timestamptz + make_interval(days => $5))`,
                      [id[s], l.id, l.d, at, 9 + i * 20 + lag]);
    }
  }
  // Term-1 classes: Maya came to nearly all of them, Leo to most.
  const t1Sessions = await rows(db.query(`select id, title, starts_at from public.sessions where batch_id = $1 order by starts_at`, [term1]));
  for (const [i, s] of t1Sessions.entries()) {
    if (i % 7 !== 5) await db.query(`insert into public.attendance (session_id, student_id, first_joined_at, minutes) values ($1, $2, $3, $4)`,
                                    [s.id, id.student, s.starts_at, s.title.startsWith('Live') ? 57 : 38]);
    if (i % 4 !== 3) await db.query(`insert into public.attendance (session_id, student_id, first_joined_at, minutes) values ($1, $2, $3, 41)`,
                                    [s.id, id.classmate, s.starts_at]);
  }
  // Term-1 projects. Maya: project 1 passed after one revision, project 2 Distinguished, project 3 Proficient.
  const t1Projects = (await rows(db.query(`select id from public.batch_assignments where batch_id = $1 order by due_at`, [term1]))).map((r) => r.id);
  const submitAndGrade = async (who, project, link, grades, feedback) => {
    for (const [n, grade] of grades.entries()) {
      await as(id[who])(`select submit_assignment($1, $2, null, $3)`, [project, link, n ? 'Revised after your feedback.' : null]);
      const sub = await one(db.query(`select id from public.submissions where assignment_id = $1 and student_id = $2`, [project, id[who]]));
      await as(id.instructor)(`select grade_submission($1, $2, $3)`, [sub, grade, feedback[n] ?? null]);
    }
  };
  await submitAndGrade('student', t1Projects[0], 'https://github.com/maya-demo/python-basics', ['basic', 'proficient'],
    ['Works, but add tests for the edge cases you describe in the README.', 'The tests cover the edge cases now. Well done.']);
  await submitAndGrade('student', t1Projects[1], 'https://github.com/maya-demo/data-structures', ['distinguished'],
    ['Exceptionally clear complexity analysis; this could serve as an example for the class.']);
  await submitAndGrade('student', t1Projects[2], 'https://github.com/maya-demo/term1-project', ['proficient'], ['Meets every requirement.']);
  for (const p of t1Projects) await submitAndGrade('classmate', p, 'https://github.com/leo-demo/term1', ['proficient'], ['Meets the requirements.']);
  await db.query(`update public.submissions s set submitted_at = a.due_at - interval '2 days', graded_at = a.due_at + interval '1 day'
                  from public.batch_assignments a where a.id = s.assignment_id and a.batch_id = $1`, [term1]);

  // The daily job on the day after term 1 ended: both completed the term, so seats in term 2 were reserved;
  // the admin then confirmed them (later this will be the term payment).
  await service(`select update_batch_statuses(($1::date + 1))`, [t1.ends_on]);
  for (const s of ['student', 'classmate']) {
    const reserved = await one(db.query(`select id from public.enrollments where student_id = $1 and status = 'reserved'`, [id[s]]));
    await as(id.admin)(`select admin_set_enrollment_status($1, 'active')`, [reserved]);
  }

  // ---------------------------------------------------------------- the current and next batches
  const current = await one(db.query(`select b.id from public.enrollments e join public.batches b on b.id = e.batch_id
                                      where e.student_id = $1 and e.status = 'active'`, [id.student]));
  const starts = (await db.query(`select starts_on::text cur, first_monday((starts_on + interval '1 month')::date)::text nxt
                                  from public.batches where id = $1`, [current])).rows[0];
  const batch = {
    current,
    next: await one(service(`select create_batch('bs-aiml', $1, 1)`, [starts.nxt])),
    otherProgram: await one(service(`select create_batch('ms-ds', $1, 1)`, [starts.cur])),
    term1,
  };
  await service(`select enroll_student($1, 'bs-aiml', $2)`, [id.nextBatch, starts.nxt]);
  await service(`select enroll_student($1, 'ms-ds', $2)`, [id.otherProgram, starts.cur]);
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [batch.current, id.instructor]);
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [batch.next, id.instructor2]);
  await as(id.admin)(`select admin_assign_staff($1, $2)`, [batch.otherProgram, id.instructor2]);
  await service(`select update_batch_statuses(current_date)`);

  // Placeholder Zoom links (not real meetings).
  await db.query(`update public.sessions s set join_url = 'https://zoom.us/j/9' || lpad(n::text, 9, '0')
                  from (select id, row_number() over (order by starts_at, id) n from public.sessions) x where x.id = s.id`);

  // Term 2 so far: Maya finished the first two lessons and is 40% into the third.
  for (const [i, l] of (await lessonsOf(2)).slice(0, 3).entries()) {
    const buckets = Math.ceil(l.d / 10);
    const done = i < 2;
    const watched = done ? buckets : Math.floor(buckets * 0.4);
    await db.query(`insert into public.lesson_progress (student_id, lesson_id, watched, watched_seconds, last_position, completed_at, updated_at)
                    values ($1, $2, array_fill(true, array[$3::int]) || array_fill(false, array[$4::int]), $5, $6,
                            case when $7 then now() - make_interval(days => 9 - 4 * $8) end, now() - make_interval(days => 9 - 4 * $8))`,
                    [id.student, l.id, watched, buckets - watched, Math.min(l.d, watched * 10), done ? l.d : watched * 10, done, i]);
  }

  // Past classes: attendance for both students, recordings for the live classes (newest two announced).
  const past = await rows(db.query(`select id, title, starts_at, ends_at from public.sessions
                                    where batch_id = $1 and ends_at < now() order by starts_at`, [batch.current]));
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

  // Term-2 project 1: Maya passed after one resubmission; Leo's is waiting to be graded.
  const [p1] = (await rows(db.query(`select id from public.batch_assignments where batch_id = $1 order by due_at`, [batch.current]))).map((r) => r.id);
  await as(id.student)(`select submit_assignment($1, 'https://github.com/maya-demo/linear-algebra', null, 'Notebook and README in the repo.')`, [p1]);
  const sub = await one(db.query(`select id from public.submissions where assignment_id = $1 and student_id = $2`, [p1, id.student]));
  await as(id.instructor)(`select grade_submission($1, 'basic', 'Good start. Show the eigenvalue check on a second matrix and explain the result.')`, [sub]);
  await as(id.student)(`select submit_assignment($1, 'https://github.com/maya-demo/linear-algebra', null, 'Added a second example and the explanation.')`, [p1]);
  await as(id.instructor)(`select grade_submission($1, 'proficient', 'Clear improvement: the second example makes the result convincing.')`, [sub]);
  await as(id.classmate)(`select submit_assignment($1, 'https://github.com/leo-demo/linear-algebra', null, null)`, [p1]);
  // Realistic timing: both handed in before the due date; Maya's grade came a day later.
  await db.query(`update public.submissions s set submitted_at = least(now() - interval '1 day', a.due_at - interval '2 days'),
                    graded_at = case when s.graded_at is not null then least(now() - interval '1 hour', a.due_at - interval '1 day') end
                  from public.batch_assignments a where a.id = s.assignment_id and a.id = $1`, [p1]);

  // PDF materials: lecture notes for every lesson, an exercise sheet for the first two lessons of each term,
  // and an assessment brief for every project. (Locally the server generates the PDF content; in production
  // admins upload it.)
  for (const program of ['bs-aiml', 'ms-ds']) {
    await db.query(`insert into public.materials (program_id, lesson_id, title, file_path, size_bytes, position)
                    select m.program_id, l.id, 'Lecture notes · ' || l.title, m.program_id || '/lessons/' || lower(l.code) || '/notes.pdf', 180000 + l.duration_seconds * 40, 1
                    from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = $1`, [program]);
    await db.query(`insert into public.materials (program_id, lesson_id, title, file_path, size_bytes, position)
                    select m.program_id, l.id, 'Exercise sheet · ' || l.title, m.program_id || '/lessons/' || lower(l.code) || '/exercises.pdf', 64000, 2
                    from public.lessons l join public.modules m on m.id = l.module_id where m.program_id = $1 and l.position <= 2`, [program]);
    await db.query(`insert into public.materials (program_id, assignment_template_id, title, file_path, size_bytes)
                    select program_id, id, 'Assessment brief · ' || title,
                           program_id || '/assignments/t' || term_no || '-' || row_number() over (partition by term_no order by due_offset_days) || '/brief.pdf', 96000
                    from public.assignment_templates where program_id = $1`, [program]);
  }
  await db.query(`insert into storage.objects (bucket_id, name, metadata)
                  select 'course-files', file_path, jsonb_build_object('title', title, 'mimetype', 'application/pdf', 'size', size_bytes)
                  from public.materials`);

  await db.query(`update public.profiles set last_active_at = now() - interval '1 day' where id = $1`, [id.student]);
  await db.query(`update public.profiles set last_active_at = now() - interval '19 days' where id = $1`, [id.classmate]);

  return { batch, id, starts: { current: starts.cur, next: starts.nxt, term1: t1Start } };
}
