// The student home (my_home): learning path, streak, achievements and badges, competency gaps for a goal,
// the next best action and today's targets. Everything comes from verified learning events and only the
// caller's own data; time-gated things (Zoom links) follow the real clock, never the caller's p_now.
// Fixed dates: the batch below ran March-May 2026 (India time, +05:30).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, mar, admin, inst, lessons, projects, sessions;
const S = {};      // students, all enrolled in the March batch before it ends
const IST = (s) => `${s}+05:30`;

const enroll = async (email) => {
  const id = await h.user(email, 'student', email.split('@')[0].replace(/^./, (c) => c.toUpperCase()));
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-03-02')`, [id]);
  return id;
};
const home = (u, now, batch = mar) => h.one(h.as(u), `select my_home($1, $2::timestamptz)`, [batch, now]);
const finish = (u, lesson) => h.sql(`insert into lesson_progress (student_id, lesson_id, watched_seconds, completed_at) values ($1, $2, 600, now())
                                     on conflict (student_id, lesson_id) do update set completed_at = now()`, [u, lesson]);
const submit = (u, task, link = 'https://github.com/student/work') => h.as(u)(`select submit_assignment($1, $2)`, [task, link]);
const grade = async (u, task, g) => {
  const sub = await h.one(h.sql, `select id from submissions where assignment_id = $1 and student_id = $2`, [task, u]);
  await h.as(inst)(`select grade_submission($1, $2, 'Feedback')`, [sub, g]);
};
const days = (u) => h.sql(`select day::text, watched_slices, lessons_completed, submissions, classes_attended from activity_days where user_id = $1 order by day`, [u]).then((r) => r.rows);
const earned = (list) => list.filter((a) => a.earned).map((a) => a.key + (a.term ? a.term : ''));
const notes = (u, kind) => h.sql(`select title, ref_id::text from notifications where user_id = $1 and kind = $2 order by title`, [u, kind]).then((r) => r.rows);
const today = () => h.one(h.sql, `select learning_day(now())::text`);

before(async () => {
  h = await freshDb();
  mar = await h.one(h.service, `select create_batch('bs-aiml', '2026-03-02')`);
  admin = await h.user('admin@test.io', 'admin');
  inst = await h.user('instructor@test.io', 'instructor');
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [mar, inst]);
  lessons = (await h.sql(`select l.id, l.title, l.code from lessons l join modules m on m.id = l.module_id
                          where m.program_id = 'bs-aiml' and m.term_no = 1 order by l.position`)).rows;
  projects = (await h.sql(`select id, title from batch_assignments where batch_id = $1 order by due_at`, [mar])).rows;
  sessions = (await h.sql(`select id, title, starts_at from sessions where batch_id = $1 order by starts_at`, [mar])).rows;
  for (const k of ['verified', 'streaky', 'achiever', 'gaps', 'next', 'gap.next', 'today', 'path', 'own.a', 'own.b']) S[k] = await enroll(`${k}@test.io`);
});

test('streak rule: single rest days are fine, two missed days in a row end the run (fixed dates)', async () => {
  const streak = (list, day) => h.one(h.sql, `select streak_of($1::date[], $2::date)`, [list, day]);
  const s = async (list, day = '2026-03-20') => { const r = await streak(list, day); return [r.current, r.alive]; };
  assert.deepEqual(await s([]), [0, false]);
  assert.deepEqual(await s(['2026-03-20']), [1, true], 'today');
  assert.deepEqual(await s(['2026-03-19']), [1, true], 'yesterday keeps it alive');
  assert.deepEqual(await s(['2026-03-18']), [0, false], 'two days ago: over');
  assert.deepEqual(await s(['2026-03-15', '2026-03-16', '2026-03-18', '2026-03-19']), [5, true], 'one rest day inside: 15th to 19th');
  assert.deepEqual(await s(['2026-03-14', '2026-03-17', '2026-03-19']), [3, true], '15th and 16th missed: the run starts on the 17th');
  assert.deepEqual(await s(['2026-03-17', '2026-03-19', '2026-03-20', '2026-03-22']), [4, true], 'future days are ignored');
  const r = await streak(['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-08', '2026-03-12'], '2026-03-13');
  assert.deepEqual([r.current, r.longest, r.reached_7, r.reached_30, r.last_active, r.active_today], [1, 8, '2026-03-07', null, '2026-03-12', false]);
});

test('learning days come only from verified events: new watched slices, completions, submissions, attendance', async () => {
  const u = S['verified'];
  const d = await today();
  await h.as(u)(`select my_dashboard()`);
  await h.as(u)(`select my_lesson($1)`, [lessons[0].id]);
  await h.as(u)(`select my_home($1)`, [mar]);
  await h.as(u)(`select update_my_profile('Vera Fide')`);
  assert.deepEqual(await days(u), [], 'opening pages is not learning');

  await h.as(u)(`select record_progress($1, 0, 30)`, [lessons[0].id]);
  assert.deepEqual(await days(u), [{ day: d, watched_slices: 3, lessons_completed: 0, submissions: 0, classes_attended: 0 }]);
  await h.as(u)(`select record_progress($1, 0, 30)`, [lessons[0].id]);
  await h.as(u)(`select record_progress($1, 10, 20)`, [lessons[0].id]);
  assert.equal((await days(u))[0].watched_slices, 3, 'replaying the same part adds nothing');
  await h.sql(`delete from activity_days where user_id = $1`, [u]);
  await h.as(u)(`select record_progress($1, 0, 30)`, [lessons[0].id]);
  assert.deepEqual(await days(u), [], 'a replay does not open a learning day either');

  await submit(u, projects[0].id);
  await h.service(`select record_attendance($1, 'verified@test.io', $2, $3)`, [sessions[0].id, IST('2026-03-03 19:00'), IST('2026-03-03 19:50')]);
  assert.deepEqual(await days(u), [{ day: '2026-03-03', watched_slices: 0, lessons_completed: 0, submissions: 0, classes_attended: 1 },
                                   { day: d, watched_slices: 0, lessons_completed: 0, submissions: 1, classes_attended: 0 }]);
  await h.sql(`update lessons set kind = 'reading' where id = $1`, [lessons[3].id]);
  await h.as(u)(`select mark_reading_done($1)`, [lessons[3].id]);
  await h.sql(`update lessons set kind = 'video' where id = $1`, [lessons[3].id]);
  assert.equal((await days(u)).find((x) => x.day === d).lessons_completed, 1);

  await rejects(h.as(u)(`select * from activity_days`), '42501');
  await rejects(h.as(u)(`insert into activity_days (user_id, day) values ($1, '2026-03-04')`, [u]), '42501');
  await rejects(h.as(u)(`select log_activity($1, '2026-03-04', 1, 0, 0, 0)`, [u]), '42501');
});

test('the streak is shown with its length, and not sent at all when switched off', async () => {
  const u = S['streaky'];
  await h.sql(`insert into activity_days (user_id, day) select $1, d::date from unnest($2::text[]) d`,
              [u, ['2026-03-09', '2026-03-10', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-16', '2026-03-17']]);
  let r = await home(u, IST('2026-03-18 09:00'));
  assert.deepEqual([r.streak.current, r.streak.alive, r.streak.active_today, r.streak.last_active], [9, true, false, '2026-03-17']);
  assert.deepEqual(earned(r.achievements), ['streak_7']);
  assert.equal((await home(u, IST('2026-03-19 09:00'))).streak.current, 0, 'two days without learning end it');

  assert.deepEqual(await h.one(h.as(u), `select set_streak_visibility(false)`), { show_streak: false });
  r = await home(u, IST('2026-03-18 09:00'));
  assert.equal(r.streak, null);
  assert.equal(r.profile.show_streak, false);
  assert.ok(r.achievements.every((a) => !a.key.startsWith('streak')), 'streak achievements are hidden too');
  assert.equal(await h.one(h.service, `select award_achievements($1)`, [u]), 0, 'and never awarded while off');
  await h.as(u)(`select set_streak_visibility(true)`);
  assert.equal(await h.one(h.service, `select award_achievements($1)`, [u]), 1);
  assert.deepEqual((await notes(u, 'achievement')).map((n) => n.title), ['Achievement: 7-day learning streak']);
  await rejects(h.as(u)(`select set_streak_visibility(null)`), 'Choose on or off');
});

test('achievements come from verified results only, and each one is announced exactly once', async () => {
  const u = S['achiever'];
  let r = await home(u, IST('2026-03-02 09:00'));
  assert.deepEqual(earned(r.achievements), []);
  assert.deepEqual(r.achievements.map((a) => a.key), ['first_lesson', 'first_project', 'distinguished', 'revised_to_mastery', 'full_week',
                                                       'streak_7', 'streak_30', 'term_complete', 'program_complete']);
  assert.ok(r.badges.length === 12 && r.badges.every((b) => !b.earned));
  assert.deepEqual(r.badges.slice(0, 2).map((b) => [b.term, b.title]), [[1, 'Python Proficiency'], [2, 'Math for ML']]);

  for (const l of lessons) await finish(u, l.id);
  await submit(u, projects[0].id);
  assert.deepEqual(earned((await home(u, IST('2026-03-21 09:00'))).achievements), ['first_lesson'], 'submitting is not passing');
  await grade(u, projects[0].id, 'basic');
  assert.deepEqual(earned((await home(u, IST('2026-03-21 09:00'))).achievements), ['first_lesson']);
  await submit(u, projects[0].id, 'https://github.com/student/work-v2');
  await grade(u, projects[0].id, 'proficient');
  await submit(u, projects[1].id);
  await grade(u, projects[1].id, 'distinguished');
  r = await home(u, IST('2026-04-20 09:00'));
  assert.deepEqual(earned(r.achievements), ['first_lesson', 'first_project', 'distinguished', 'revised_to_mastery']);
  assert.equal(r.badges[0].earned, false, 'the badge needs every project passed');

  // Every class and office hour of week 1 (but only part of week 2).
  for (const s of sessions.slice(0, 3)) {
    await h.service(`select record_attendance($1, 'achiever@test.io', $2, $2::timestamptz + interval '40 minutes')`, [s.id, s.starts_at]);
  }
  await submit(u, projects[2].id);
  await grade(u, projects[2].id, 'proficient');
  r = await home(u, IST('2026-05-20 09:00'));
  assert.deepEqual(earned(r.achievements), ['first_lesson', 'first_project', 'distinguished', 'revised_to_mastery', 'full_week']);
  assert.deepEqual([r.badges[0].earned, r.badges[1].earned], [true, false]);
  assert.equal(earned((await home(u, IST('2026-03-04 09:00'))).achievements).includes('full_week'), false, 'only once the week is over');

  // The term is completed by the daily job after the batch ends; the student moves on to term 2.
  await h.service(`select update_batch_statuses('2026-05-25')`);
  const t2 = await h.one(h.sql, `select e.id from enrollments e join batches b on b.id = e.batch_id where e.student_id = $1 and b.term_no = 2`, [u]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [t2]);
  const t2batch = await h.one(h.sql, `select batch_id from enrollments where id = $1`, [t2]);
  r = await home(u, IST('2026-06-02 09:00'), t2batch);
  assert.deepEqual(earned(r.achievements), ['first_lesson', 'first_project', 'distinguished', 'revised_to_mastery', 'full_week', 'term_complete1']);
  assert.deepEqual(r.achievements.filter((a) => a.key === 'term_complete').map((a) => [a.term, a.earned]), [[1, true], [2, false]]);

  for (let i = 0; i < 3; i++) await h.service(`select award_achievements($1)`, [u]);
  const got = await notes(u, 'achievement');
  assert.deepEqual(got.map((n) => n.title), ['Achievement: Distinguished work', 'Achievement: First lesson complete', 'Achievement: First project passed',
    'Achievement: Full week of live classes', 'Achievement: Revised to mastery', 'Achievement: Term 1 complete']);
  assert.deepEqual((await notes(u, 'badge')).map((n) => n.title), ['Skill badge earned: Python Proficiency']);
  assert.equal(await h.one(h.sql, `select count(*)::int from (select kind, ref_id from notifications where user_id = $1 group by 1, 2 having count(*) > 1) d`, [u]), 0);
  assert.doesNotMatch(JSON.stringify(r), /"(points|xp|rank|leaderboard)"/i, 'no points, ranks or leaderboards');
});

test('the final term completes the program', async () => {
  const u = await h.user('cert@test.io');
  const cpy = await h.one(h.service, `select create_batch('c-py', '2026-03-02')`);
  await h.as(admin)(`select admin_assign_staff($1, $2)`, [cpy, inst]);
  await h.service(`select enroll_student($1, 'c-py', '2026-03-02')`, [u]);
  for (const l of (await h.sql(`select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'c-py'`)).rows) await finish(u, l.id);
  for (const t of (await h.sql(`select id from batch_assignments where batch_id = $1`, [cpy])).rows) { await submit(u, t.id); await grade(u, t.id, 'proficient'); }
  const before = await home(u, IST('2026-05-20 09:00'), cpy);
  assert.equal(before.achievements.find((a) => a.key === 'program_complete').earned, false);
  await h.service(`select update_batch_statuses('2026-05-25')`);
  assert.ok((await notes(u, 'achievement')).some((n) => n.title === 'Achievement: Program complete'));
  assert.deepEqual((await notes(u, 'badge')).map((n) => n.title), ['Skill badge earned: Python Data Analysis']);
});

test('competency gaps for the goal: mastered, needs work, in progress, not started, or not in the program', async () => {
  const u = S['gaps'];
  let r = await home(u, IST('2026-03-02 09:00'));
  assert.deepEqual([r.goal.role, r.goal.title, r.goal.suggested], ['ml-ai-specialist', 'ML / AI Specialist', true], 'first role suggested for the program');
  assert.ok(r.roles.find((x) => x.id === 'ml-engineer').for_program && !r.roles.find((x) => x.id === 'data-analyst').for_program);

  assert.deepEqual(await h.one(h.as(u), `select set_my_goal('data-analyst')`), { goal_role: 'data-analyst', title: 'Data Analyst' });
  const status = async () => Object.fromEntries((await home(u, IST('2026-03-02 09:00'))).goal.skills.map((s) => [s.lesson_code, s.status]));
  r = await home(u, IST('2026-03-02 09:00'));
  assert.equal(r.goal.suggested, false);
  const byCode = Object.fromEntries(r.goal.skills.map((s) => [s.lesson_code, s]));
  assert.deepEqual(r.goal.skills.map((s) => s.skill), ['SQL querying', 'Python for data', 'Exploratory analysis', 'Data visualization', 'Dashboards & storytelling']);
  assert.deepEqual([byCode['PRG-101'].term, byCode['PRG-101'].available, byCode['PRG-101'].lesson_id], [1, true, lessons[0].id]);
  assert.deepEqual([byCode['DBS-130'].term, byCode['DBS-130'].available, byCode['DBS-130'].status], [4, false, 'not_started'], 'later term: listed, not open');
  assert.deepEqual([byCode['VIS-240'].status, byCode['VIS-240'].lesson_id, byCode['VIS-240'].programs.map((p) => p.id)], ['not_in_program', null, ['bs-ds']]);

  assert.equal((await status())['PRG-101'], 'not_started');
  await h.as(u)(`select record_progress($1, 0, 30)`, [lessons[0].id]);
  assert.equal((await status())['PRG-101'], 'in_progress');
  await submit(u, projects[0].id);
  await grade(u, projects[0].id, 'not_yet');
  assert.equal((await status())['PRG-101'], 'needs_work');
  await finish(u, lessons[0].id);
  assert.equal((await status())['PRG-101'], 'needs_work', 'a complete lesson is not mastery while its project needs work');
  await submit(u, projects[0].id, 'https://github.com/student/work-v2');
  assert.equal((await status())['PRG-101'], 'in_progress');
  await grade(u, projects[0].id, 'proficient');
  assert.equal((await status())['PRG-101'], 'mastered');

  await h.as(u)(`select set_my_goal(null)`);
  assert.equal((await home(u, IST('2026-03-02 09:00'))).goal.role, 'ml-ai-specialist', 'back to the suggestion');
  await rejects(h.as(u)(`select set_my_goal('astronaut')`), 'Choose one of the listed goals');
  await rejects(h.anon(`select set_my_goal('data-analyst')`), '42501');
  await rejects(h.as(u)(`update profiles set goal_role = 'ai-engineer', show_streak = false where id = $1`, [u]), '42501');
});

test('next best action follows its fixed order of priority, with a plain reason', async () => {
  const u = S['next'];
  const next = async (now) => (await home(u, now)).next_action;
  let n = await next(IST('2026-03-02 09:00'));                          // Monday: first class is Tuesday 19:00, 34 hours away
  assert.deepEqual([n.kind, n.id, n.reason], ['start', lessons[0].id, 'The next lesson of Term 1.']);
  n = await next(IST('2026-03-03 12:00'));
  assert.deepEqual([n.kind, n.id], ['session', sessions[0].id]);
  assert.equal(n.reason, 'Your next live class starts within 24 hours.');
  assert.equal((await next(IST('2026-03-03 19:10'))).reason, 'Your live class is on now.');
  await h.as(u)(`select record_progress($1, 0, 30)`, [lessons[1].id]);
  n = await next(IST('2026-03-02 09:00'));
  assert.deepEqual([n.kind, n.id], ['continue', lessons[1].id]);
  assert.match(n.reason, /^You are \d+% of the way through this lesson\.$/);
  n = await next(IST('2026-03-22 09:00'));                              // Sunday after project 1 was due (Mar 20)
  assert.deepEqual([n.kind, n.id, n.reason], ['overdue', projects[0].id, 'It is past its due date. You can still submit it.']);
  await submit(u, projects[0].id);
  assert.equal((await next(IST('2026-03-22 09:00'))).kind, 'continue', 'submitted: waiting for review is not overdue');
  await grade(u, projects[0].id, 'basic');
  n = await next(IST('2026-03-22 09:00'));
  assert.deepEqual([n.kind, n.id], ['resubmit', projects[0].id]);
  assert.match(n.reason, /no penalty/);
  await submit(u, projects[0].id, 'https://github.com/student/work-v2');
  await grade(u, projects[0].id, 'proficient');
  for (const l of lessons) await finish(u, l.id);
  n = await next(IST('2026-04-12 09:00'));                              // Sunday; project 2 due Friday Apr 17
  assert.deepEqual([n.kind, n.id, n.reason], ['due_soon', projects[1].id, 'Due within a week, and not submitted yet.']);
  n = await next(IST('2026-04-05 09:00'));
  assert.deepEqual([n.kind, n.id], ['caught_up', null]);
  assert.equal(n.title, 'You’re all caught up');
});

test('next best action: closing a goal gap when nothing else is pending', async () => {
  const u = S['gap.next'];
  // An admin recorded term 1 as completed (credit for prior learning); the student is now in term 2.
  await h.as(admin)(`select admin_set_enrollment_status((select id from enrollments where student_id = $1), 'completed')`, [u]);
  await h.service(`select update_batch_statuses('2026-05-25')`);
  const e2 = await h.one(h.sql, `select e.id from enrollments e join batches b on b.id = e.batch_id where e.student_id = $1 and b.term_no = 2`, [u]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [e2]);
  const jun = await h.one(h.sql, `select batch_id from enrollments where id = $1`, [e2]);
  for (const l of (await h.sql(`select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' and m.term_no = 2`)).rows) await finish(u, l.id);
  await h.as(u)(`select set_my_goal('data-analyst')`);
  const at = IST('2026-06-01 08:00');                                    // the term-2 batch starts June 1
  let n = (await home(u, at, jun)).next_action;
  assert.deepEqual([n.kind, n.id], ['gap', lessons[0].id]);
  assert.equal(n.reason, 'It builds “Python for data” for your goal: Data Analyst.');
  await finish(u, lessons[0].id);
  assert.equal((await home(u, at, jun)).next_action.kind, 'caught_up');
});

test('today\'s targets: the lesson to finish, today\'s class, and work due soon', async () => {
  const u = S['today'];
  let t = (await home(u, IST('2026-03-03 10:00'))).targets;
  assert.deepEqual(t.map((x) => [x.kind, x.title, x.done]), [['lesson', `Start ${lessons[0].title}`, false],
    ['session', `Join ${sessions[0].title}`, false]]);
  await h.service(`select record_attendance($1, 'today@test.io', $2, $2::timestamptz + interval '55 minutes')`, [sessions[0].id, sessions[0].starts_at]);
  await h.as(u)(`select record_progress($1, 0, 30)`, [lessons[0].id]);
  t = (await home(u, IST('2026-03-03 10:00'))).targets;
  assert.deepEqual(t.map((x) => [x.kind, x.done]), [['lesson', false], ['session', true]]);
  assert.equal(t[0].title, `Finish ${lessons[0].title}`);
  t = (await home(u, IST('2026-03-18 10:00'))).targets;
  assert.deepEqual(t.map((x) => [x.kind, x.title, x.done]), [['lesson', `Finish ${lessons[0].title}`, false], ['assignment', `Submit ${projects[0].title}`, false]]);
  await submit(u, projects[0].id);
  assert.equal((await home(u, IST('2026-03-18 10:00'))).targets[1].done, true);
  await h.sql(`update lesson_progress set completed_at = $3::timestamptz where student_id = $1 and lesson_id = $2`, [u, lessons[0].id, IST('2026-03-18 08:00')]);
  t = (await home(u, IST('2026-03-18 10:00'))).targets;
  assert.deepEqual(t[0], { kind: 'lesson', id: lessons[0].id, title: `Finish ${lessons[0].title}`, done: true }, 'finished today: ticked');
  assert.ok(t.length <= 3);
});

test('learning path: whole-program and term progress, and the term-by-term path', async () => {
  const u = S['path'];
  for (const l of lessons.slice(0, 2)) await finish(u, l.id);
  let p = (await home(u, IST('2026-03-10 09:00'))).path;
  assert.deepEqual([p.lessons_completed, p.lessons_total], [2, 48]);
  assert.equal(p.terms.length, 12);
  assert.deepEqual(p.terms.slice(0, 2).map((t) => [t.term, t.title, t.badge, t.status, t.starts_on, t.ends_on, t.lessons_completed, t.lessons_total]),
                   [[1, 'Python & computing', 'Python Proficiency', 'current', '2026-03-02', '2026-05-24', 2, 4],
                    [2, 'Mathematics for ML', 'Math for ML', 'upcoming', null, null, 0, 4]]);
  // Finished term 1, now in term 2, with term 3 already reserved.
  for (const l of lessons.slice(2)) await finish(u, l.id);
  for (const t of projects) { await submit(u, t.id); await grade(u, t.id, 'proficient'); }
  await h.service(`select update_batch_statuses('2026-05-25')`);
  const e2 = await h.one(h.sql, `select e.id from enrollments e join batches b on b.id = e.batch_id where e.student_id = $1 and b.term_no = 2`, [u]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'active')`, [e2]);
  const jun = await h.one(h.sql, `select batch_id from enrollments where id = $1`, [e2]);
  const t3 = await h.one(h.service, `select create_batch('bs-aiml', '2026-09-07', 3)`);
  await h.sql(`insert into enrollments (student_id, batch_id, program_id, status, source) values ($1, $2, 'bs-aiml', 'reserved', 'progression')`, [u, t3]);
  const r = await home(u, IST('2026-06-10 09:00'), jun);
  p = r.path;
  assert.deepEqual(p.terms.slice(0, 4).map((t) => [t.term, t.status, t.starts_on]),
                   [[1, 'completed', '2026-03-02'], [2, 'current', '2026-06-01'], [3, 'reserved', '2026-09-07'], [4, 'upcoming', null]]);
  assert.deepEqual([p.lessons_completed, r.batch.lessons_completed, r.batch.lessons_total, r.batch.term], [4, 0, 4, 2]);
});

test('my_home: the caller\'s own data only, for batches they may open', async () => {
  const a = S['own.a'];
  const b = S['own.b'];
  await finish(a, lessons[0].id);
  const other = await h.one(h.service, `select create_batch('ms-ds', '2026-03-02')`);
  await rejects(h.as(a)(`select my_home($1)`, [other]), 'Batch not found');
  await rejects(h.as(a)(`select my_home(gen_random_uuid())`), 'Batch not found');
  await rejects(h.anon(`select my_home($1)`, [mar]), '42501');
  const rb = await home(b, IST('2026-03-10 09:00'));
  assert.equal(rb.path.lessons_completed, 0, 'a classmate\'s progress is not mixed in');
  assert.equal(rb.profile.name, 'Own.b');
  const paused = await h.one(h.sql, `select id from enrollments where student_id = $1`, [b]);
  await h.as(admin)(`select admin_set_enrollment_status($1, 'paused')`, [paused]);
  await rejects(h.as(b)(`select my_home($1)`, [mar]), 'Batch not found');
});

test('a made-up p_now never unlocks a Zoom link on the home page', async () => {
  const u = await h.user('clock@test.io');
  const live = await h.one(h.service, `select create_batch('bs-ds', '2026-03-02')`);
  await h.service(`select enroll_student($1, 'bs-ds', '2026-03-02')`, [u]);
  const [soon, later] = (await h.sql(`select id from sessions where batch_id = $1 order by starts_at limit 2`, [live])).rows.map((r) => r.id);
  await h.sql(`update sessions set join_url = 'https://zoom.us/j/' || substr(md5(id::text), 1, 10) where batch_id = $1`, [live]);
  await h.sql(`update sessions set starts_at = now() + interval '10 minutes', ends_at = now() + interval '70 minutes' where id = $1`, [soon]);
  await h.sql(`update sessions set starts_at = now() + interval '3 hours', ends_at = now() + interval '4 hours' where id = $1`, [later]);
  const open = await h.one(h.as(u), `select my_home($1)`, [live]);
  assert.match(open.batch.next_sessions.find((s) => s.id === soon).join_url, /^https:\/\/zoom\.us\/j\//, 'opens 15 minutes before, by the real clock');
  const faked = await h.one(h.as(u), `select my_home($1, now() + interval '3 hours 5 minutes')`, [live]);
  assert.ok(faked.batch.next_sessions.some((s) => s.id === later), 'the later class is listed');
  assert.equal(faked.batch.next_sessions.find((s) => s.id === later).join_url, null);
  assert.doesNotMatch(JSON.stringify(faked), /zoom\.us/, 'no link anywhere in the reply');
});
