// Instructors and admins: only their batches, the grading loop with students, the roster.
import { test, expect } from '@playwright/test';
import { reset, sql, one, login, loginAs, watchErrors } from './helpers.mjs';

let demo;
test.beforeEach(async ({ request }) => { demo = await reset(request); });

test('an instructor lands on Teaching and sees only the batch they teach', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'instructor');
  const mine = await one(request, `select code from batches where id = $1`, [demo.batch.current]);
  const other = await one(request, `select code from batches where id = $1`, [demo.batch.next]);
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: mine })).toBeVisible();
  await expect(page.getByText(other)).toHaveCount(0);
  await expect(page.locator('.snav [data-badge="grade"]')).toHaveText('1');
  await expect(page.getByRole('region', { name: 'Students who may need a nudge' })).toContainText('Leo Martins');
  expect(errors).toEqual([]);
});

test('students are kept out of staff pages and staff out of student pages', async ({ page }) => {
  await loginAs(page, 'instructor');
  await page.goto('/portal/#/home');
  await expect(page).toHaveURL(/#\/teach$/);
  await page.goto('/portal/#/assignments');
  await expect(page).toHaveURL(/#\/teach$/);
});

test('grading loop: feedback, resubmission, pass; the student sees each step', async ({ page }) => {
  // Instructor asks for a resubmission.
  await loginAs(page, 'instructor');
  await page.locator('[data-nav="grading"]').click();
  const item = page.locator('section.assign').first();
  await expect(item).toContainText('Leo Martins');
  await item.getByText('Basic', { exact: true }).click();
  await item.getByRole('button', { name: 'Submit grade' }).click();
  await expect(item.getByRole('alert')).toContainText('Add feedback');
  await item.getByLabel(/Feedback for/).fill('Add a validation split and report precision and recall.');
  await item.getByRole('button', { name: 'Submit grade' }).click();
  await expect(page.getByText('Graded Basic. The student has been notified.')).toBeVisible();
  await expect(page.getByText('Nothing to grade')).toBeVisible();
  await expect(page.locator('.snav [data-badge="grade"]')).toBeHidden();

  // Student sees the feedback and resubmits.
  await page.getByRole('button', { name: /Elena Ruiz/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await loginAs(page, 'classmate');
  await page.locator('[data-nav="assignments"]').click();
  const p1 = page.locator('section.assign').first();
  await expect(p1.locator('.pill').first()).toHaveText('Resubmission needed');
  await expect(p1.locator('.feedback')).toContainText('precision and recall');
  await p1.getByLabel('Link to your work').fill('https://github.com/leo-demo/churn-v2');
  await p1.getByRole('button', { name: 'Resubmit' }).click();
  await expect(page.locator('section.assign').first().locator('.pill').first()).toHaveText('Submitted · awaiting review');

  // Instructor sees attempt 2 with the earlier feedback, and passes it.
  await page.getByRole('button', { name: /Leo Martins/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await loginAs(page, 'instructor');
  await page.locator('[data-nav="grading"]').click();
  const again = page.locator('section.assign').first();
  await expect(again).toContainText('Attempt 2');
  await expect(again).toContainText('precision and recall');
  await again.getByText('Proficient', { exact: true }).click();
  await again.getByRole('button', { name: 'Submit grade' }).click();
  await expect(page.getByText('Graded Proficient.')).toBeVisible();

  await page.getByRole('button', { name: /Elena Ruiz/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await loginAs(page, 'classmate');
  await page.locator('[data-nav="assignments"]').click();
  await expect(page.locator('section.assign').first().locator('.pill').first()).toHaveText('Passed');
  await expect(page.locator('section.assign').first()).not.toContainText('Resubmit');
});

test('roster shows each student\'s progress; another instructor cannot open it', async ({ page }) => {
  await loginAs(page, 'instructor');
  await page.getByRole('link', { name: /Roster/ }).first().click();
  const rows = page.locator('table.data tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Maya Patel' })).toContainText('2/4');
  await expect(rows.filter({ hasText: 'Leo Martins' }).locator('.pill.warn')).toContainText('days ago');

  await page.getByRole('button', { name: /Elena Ruiz/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await loginAs(page, 'instructor2');
  await page.goto(`/portal/#/roster/${demo.batch.current}`);
  await expect(page.getByText('This page isn’t available')).toBeVisible();
});

test('admins see every batch', async ({ page }) => {
  await loginAs(page, 'admin');
  await expect(page.locator('.band .eyebrow')).toContainText('Admin');
  await expect(page.locator('section.card h2[id^="b-"]')).toHaveCount(3);
});

test('instructors can preview lessons without it counting as progress', async ({ page, request }) => {
  const lesson = await one(request, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' order by m.position, l.position limit 1`);
  await page.clock.install();
  await login(page, 'instructor');
  await expect(page).toHaveURL(/#\/teach$/);
  await page.goto(`/portal/#/lesson/${lesson}`);
  await expect(page.getByText('Preview mode')).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Pause' }).first().click();
  expect(await one(request, `select count(*)::int from lesson_progress where student_id = $1`, [demo.id.instructor])).toBe(0);
});
