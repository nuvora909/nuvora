// The student home: learning path rings, the next step, today's targets, the streak, achievements, skill
// badges and the skills for a career goal. What the page shows must match the database.
import { test, expect } from '@playwright/test';
import { reset, sql, one, loginAs, watchErrors } from './helpers.mjs';

let demo;
test.beforeEach(async ({ request }) => { demo = await reset(request); });

const percent = (n, total) => Math.round((100 * n) / total);
const lessonsDone = (request, student, term) => one(request, `select count(*)::int from lesson_progress lp join lessons l on l.id = lp.lesson_id
  join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' and lp.student_id = $1 and lp.completed_at is not null
  and ($2::int is null or m.term_no = $2)`, [student, term]);

test('greeting, progress rings and the term-by-term path match the database', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'student');
  const all = await lessonsDone(request, demo.id.student, null);
  const term = await lessonsDone(request, demo.id.student, 2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Maya/);
  await expect(page.locator('.band.dark .eyebrow')).toContainText('Term 2 of 12');
  await expect(page.getByRole('img', { name: `Learning path ${percent(all, 48)}% complete` })).toBeVisible();
  await expect(page.getByRole('img', { name: `Term 2 ${percent(term, 4)}% complete` })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your learning path' })).toContainText(`${all} of 48 lessons in 12 terms`);
  const terms = page.getByRole('region', { name: 'Term by term' }).locator('li');
  await expect(terms).toHaveCount(12);
  await expect(terms.nth(0)).toContainText('Term 1: Python & computing');
  await expect(terms.nth(0)).toContainText('Completed');
  await expect(terms.nth(1)).toContainText('Current term');
  await expect(terms.nth(2)).toContainText('Upcoming');
  await expect(page.locator('main .btn.gold'), 'one main action on the page').toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the next step is the one gold button, with a reason, and it takes you there', async ({ page, request }) => {
  // Keep live classes out of the next 24 hours so the step is the lesson Maya is part-way through.
  await sql(request, `update sessions set starts_at = starts_at + interval '3 days', ends_at = ends_at + interval '3 days'
                      where batch_id = $1 and ends_at > now() - interval '1 hour' and starts_at < now() + interval '30 hours'`, [demo.batch.current]);
  const inProgress = await one(request, `select l.title from lesson_progress lp join lessons l on l.id = lp.lesson_id
                                         where lp.student_id = $1 and lp.completed_at is null and lp.watched_seconds > 0`, [demo.id.student]);
  await loginAs(page, 'student');
  const step = page.getByRole('region', { name: 'Your next step' });
  await expect(step).toContainText(inProgress);
  await expect(step).toContainText(/You are \d+% of the way through this lesson\./);
  await step.getByRole('link', { name: /Continue the lesson/ }).click();
  await expect(page).toHaveURL(/#\/lesson\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(inProgress);

  // An instructor asks for a revision: that comes first now.
  await sql(request, `update submissions s set status = 'needs_resubmission', grade = 'basic' from batch_assignments a
                      where a.id = s.assignment_id and a.batch_id = $1 and s.student_id = $2`, [demo.batch.current, demo.id.student]);
  await page.locator('[data-nav="home"]').click();
  await expect(step).toContainText('Resubmitting has no penalty');
  await expect(page.locator('main .btn.gold')).toHaveAttribute('data-next', 'resubmit');
  await step.getByRole('link', { name: /Revise and resubmit/ }).click();
  await expect(page).toHaveURL(/#\/assignments$/);
});

test('today\'s targets tick off what was done today', async ({ page, request }) => {
  await loginAs(page, 'student');
  const today = page.getByRole('region', { name: 'Today’s targets' });
  const lesson = today.locator('li').first();
  await expect(lesson).toContainText(/Finish .+To do/);
  await sql(request, `update lesson_progress set completed_at = now(), watched_seconds = l.duration_seconds from lessons l
                      where l.id = lesson_progress.lesson_id and student_id = $1 and completed_at is null and watched_seconds > 0`, [demo.id.student]);
  await page.reload();
  await expect(today.locator('li.done').first()).toContainText('Done');
});

test('the streak shows its length and disappears when switched off in Profile', async ({ page, request }) => {
  const n = Number(await one(request, `select streak_of(array(select day from activity_days where user_id = $1), learning_day(now()))->>'current'`, [demo.id.student]));
  expect(n).toBeGreaterThan(0);
  await loginAs(page, 'student');
  await expect(page.getByRole('region', { name: 'Learning streak' })).toContainText(`${n}-day learning streak`);
  await expect(page.getByRole('region', { name: 'Achievements' })).toContainText('7-day learning streak');

  await page.locator('[data-nav="profile"]').click();
  const toggle = page.getByRole('switch', { name: 'Show my learning streak' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByText('Your streak is hidden.')).toBeVisible();
  expect(await one(request, `select show_streak from profiles where id = $1`, [demo.id.student])).toBe(false);
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByRole('region', { name: 'Achievements' })).toBeVisible();
  await expect(page.locator('[data-streak]')).toHaveCount(0);
  await expect(page.locator('main').getByText(/streak/i)).toHaveCount(0);

  await page.locator('[data-nav="profile"]').click();
  await page.getByRole('switch', { name: 'Show my learning streak' }).click();
  await expect(page.getByText('Your streak is shown on your home page.')).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await expect(page.locator('[data-streak]')).toHaveCount(1);
});

test('changing the goal in Profile changes the skills card', async ({ page }) => {
  await loginAs(page, 'student');
  const skills = page.getByRole('region', { name: /^Skills for/ });
  await expect(skills.getByRole('heading', { level: 2 })).toHaveText('Skills for ML Engineer');
  await expect(skills.locator('li').filter({ hasText: 'MLOps & continuous training' })).toContainText('Not in your program');
  await expect(skills.locator('li').filter({ hasText: 'Neural networks' })).toContainText('Term 7');

  await page.locator('[data-nav="profile"]').click();
  await page.getByLabel('Career goal').selectOption('data-analyst');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('Goal saved: Data Analyst.')).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await expect(skills.getByRole('heading', { level: 2 })).toHaveText('Skills for Data Analyst');
  const python = skills.locator('li').filter({ hasText: 'Python for data' });
  await expect(python).toContainText('Mastered');
  await expect(skills.locator('li').filter({ hasText: 'Dashboards & storytelling' })).toContainText('Taught in B.S. Data Science');
  await expect(page.getByRole('region', { name: 'Your learning path' })).toContainText('Current goal: Data Analyst');
  await python.getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Python fundamentals');
});

test('achievements and skill badges say earned or locked in words and icons, not colour alone', async ({ page, request }) => {
  const earned = await one(request, `select count(*)::int from jsonb_array_elements(achievements_json($1, 'bs-aiml', now())) x
                                     where (x->>'earned')::boolean`, [demo.id.student]);
  await loginAs(page, 'student');
  const ach = page.getByRole('region', { name: 'Achievements' });
  await expect(ach.locator('li.earned')).toHaveCount(earned);
  await expect(ach.locator('li').filter({ hasText: 'Distinguished work' })).toContainText(/Earned \d/);
  await expect(ach.locator('li').filter({ hasText: 'Program complete' })).toContainText('Not yet earned');
  for (const li of await ach.locator('li').all()) await expect(li.locator('svg')).toHaveCount(1);
  const badges = page.getByRole('region', { name: 'Skill badges' });
  await expect(badges.locator('li')).toHaveCount(12);
  await expect(badges.locator('li').filter({ hasText: 'Python Proficiency' })).toContainText('Term 1 · Earned');
  await expect(badges.locator('li').filter({ hasText: 'Math for ML' })).toContainText('Term 2 · Locked');
  await page.locator('[data-nav="notifications"]').click();
  await expect(page.getByText('Skill badge earned: Python Proficiency')).toBeVisible();
});

test('a student between terms sees the reserved seat instead of an empty page', async ({ page, request }) => {
  await sql(request, `update enrollments set status = 'reserved' where student_id = $1 and status = 'active'`, [demo.id.student]);
  await loginAs(page, 'student');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your next term');
  await expect(page.getByText(/^Term 2: Mathematics for ML starts/)).toBeVisible();
  await expect(page.getByText('Your seat is reserved.', { exact: false })).toBeVisible();
});
