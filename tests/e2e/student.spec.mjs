// A student's day: dashboard, course, watching lessons, live classes, assignments, notifications, profile.
import { test, expect } from '@playwright/test';
import { reset, sql, one, loginAs, watchErrors, ACCOUNTS } from './helpers.mjs';

let demo;
test.beforeEach(async ({ request }) => { demo = await reset(request); });

const lessonIds = (request) => sql(request, `select l.id, l.title, l.duration_seconds d from lessons l join modules m on m.id = l.module_id
                                             where m.program_id = 'bs-aiml' order by m.position, l.position`);

test('dashboard shows the student\'s own batch with numbers that match the database', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'student');
  const code = await one(request, `select code from batches where id = $1`, [demo.batch.current]);
  const held = await one(request, `select count(*)::int from sessions where batch_id = $1 and ends_at <= now()`, [demo.batch.current]);
  const attended = await one(request, `select count(*)::int from attendance where student_id = $1`, [demo.id.student]);
  await expect(page.getByRole('heading', { name: 'Welcome back, Maya' })).toBeVisible();
  await expect(page.locator('.band .eyebrow')).toContainText(code);
  const tiles = page.locator('.tile');
  await expect(tiles.nth(0)).toContainText('3/16');
  await expect(tiles.nth(1)).toContainText(`${attended}/${held}`);
  await expect(tiles.nth(2)).toContainText('1/3');
  await expect(page.getByRole('region', { name: 'Continue watching' }).locator('a.item')).toHaveCount(1);
  await expect(page.locator('[data-badge="unread"]').first()).toHaveText(/^\d+$/);
  expect(errors).toEqual([]);
});

test('a student never sees another batch, program or staff page', async ({ page, request }) => {
  await loginAs(page, 'student');
  const otherCode = await one(request, `select code from batches where id = $1`, [demo.batch.next]);
  await expect(page.getByText(otherCode)).toHaveCount(0);
  await page.goto(`/portal/#/roster/${demo.batch.current}`);
  await expect(page).toHaveURL(/#\/home$/);
  await page.goto('/portal/#/teach');
  await expect(page).toHaveURL(/#\/home$/);
  const msLesson = await one(request, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'ms-ds' limit 1`);
  await page.goto(`/portal/#/lesson/${msLesson}`);
  await expect(page.getByText('This page isn’t available')).toBeVisible();
  // Even calling the API directly with the student's own token returns nothing from the other batch.
  const res = await page.evaluate(async (batch) => {
    const s = JSON.parse(localStorage.getItem('nuvora.session'));
    const r = await fetch('/rest/v1/rpc/my_sessions', { method: 'POST', headers: { apikey: window.NUVORA_CONFIG.anonKey,
      Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_batch: batch }) });
    return r.status;
  }, demo.batch.next);
  expect(res).toBe(404);
});

test('course page lists every lesson with progress, and the current module is open', async ({ page }) => {
  await loginAs(page, 'student');
  await page.locator('[data-nav="course"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('B.S. Artificial Intelligence & Machine Learning');
  await expect(page.locator('a.lesson')).toHaveCount(16);
  await expect(page.locator('a.lesson .st.done')).toHaveCount(3);
  await expect(page.locator('details.mod[open]')).toHaveCount(1);
  await expect(page.locator('details.mod[open] summary')).toContainText('Module 1');
  await expect(page.getByText('3 of 16 lessons complete')).toBeVisible();
});

test('watching a lesson to 90% completes it; progress is saved as you watch', async ({ page, request }) => {
  const errors = watchErrors(page);
  const lessons = await lessonIds(request);
  const l = lessons[3];                                              // 40% watched in the demo
  await page.clock.install();
  await loginAs(page, 'student');
  await page.goto(`/portal/#/lesson/${l.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(l.title);
  await expect(page.getByText(/Resuming at/)).toBeVisible();
  // Record every toast message: they disappear after 4 seconds, so checking visibility later would race.
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(() => { const t = document.getElementById('toast'); if (t && !t.hidden) window.__toasts.push(t.textContent); })
      .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  });
  await page.getByLabel('Playback speed').selectOption('2');
  await page.getByRole('button', { name: 'Play' }).first().click();
  const done = page.locator('[data-status] .pill.good');
  for (let i = 0; i < 80 && !(await done.isVisible()); i++) await page.clock.runFor(10_000);
  await expect(done).toHaveText(/Completed/);
  expect(await page.evaluate(() => window.__toasts)).toContain('Lesson complete. Nice work!');
  const row = (await sql(request, `select watched_seconds, completed_at is not null as done from lesson_progress where student_id = $1 and lesson_id = $2`, [demo.id.student, l.id]))[0];
  expect(row.done).toBe(true);
  expect(row.watched_seconds).toBeGreaterThanOrEqual(Math.ceil(l.d * 0.9));
  expect(errors).toEqual([]);
});

test('skipping to the end of a video does not count as watching it', async ({ page, request }) => {
  const lessons = await lessonIds(request);
  const l = lessons[4];                                              // not started
  await page.clock.install();
  await loginAs(page, 'student');
  await page.goto(`/portal/#/lesson/${l.id}`);
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.clock.runFor(12_000);                                   // watch about 12 seconds
  await page.getByLabel('Seek').evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('change')); }, l.d - 20);
  for (let i = 0; i < 4; i++) await page.clock.runFor(10_000);       // play the last 20 seconds
  await expect(page.getByRole('button', { name: 'Play' }).first()).toBeVisible();   // reached the end
  const progress = () => sql(request, `select watched_seconds, last_position, completed_at is not null as done from lesson_progress
                                       where student_id = $1 and lesson_id = $2`, [demo.id.student, l.id]);
  await expect.poll(async () => (await progress())[0]?.last_position ?? 0).toBeGreaterThanOrEqual(l.d - 1);   // final save arrived
  const row = (await progress())[0];
  expect(row.done).toBe(false);
  expect(row.watched_seconds).toBeLessThanOrEqual(60);
  expect(row.watched_seconds).toBeGreaterThan(0);
});

test('lesson player has no video file to download', async ({ page, request }) => {
  const media = [];
  page.on('request', (r) => { if (['media'].includes(r.resourceType()) || /\.(mp4|webm|m3u8|mpd|mov|mkv)(\?|$)/i.test(r.url())) media.push(r.url()); });
  const lessons = await lessonIds(request);
  await loginAs(page, 'student');
  await page.goto(`/portal/#/lesson/${lessons[0].id}`);
  await expect(page.locator('.player')).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(1500);
  expect(await page.locator('video, audio, source, object, embed, a[download]').count()).toBe(0);
  const blocked = await page.locator('.player').evaluate((el) => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(blocked).toBe(true);
  await expect(page.locator('.player .wmark')).toHaveText(ACCOUNTS.student.email);
  expect(media).toEqual([]);
});

test('the Join button appears 15 minutes before class, with the batch\'s Zoom link', async ({ page, request }) => {
  const next = (await sql(request, `select id, join_url from sessions where batch_id = $1 and starts_at > now() order by starts_at limit 1`, [demo.batch.current]))[0];
  await loginAs(page, 'student');
  await page.locator('[data-nav="live"]').click();
  await expect(page.locator(`[data-session="${next.id}"] button:has-text("Join opens")`)).toBeDisabled();
  await expect(page.locator('a:has-text("Join class")')).toHaveCount(0);

  await sql(request, `update sessions set starts_at = now() + interval '10 minutes', ends_at = now() + interval '70 minutes' where id = $1`, [next.id]);
  await page.reload();
  const join = page.locator(`[data-session="${next.id}"] a:has-text("Join class")`);
  await expect(join).toHaveAttribute('href', next.join_url);
  await expect(join).toHaveAttribute('target', '_blank');
  await expect(join).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('a:has-text("Join class")')).toHaveCount(1);
  await page.locator('[data-nav="home"]').click();
  await expect(page.locator('.announce')).toContainText('is open now');
});

test('past classes show attendance and recordings, which play only in the portal', async ({ page, request }) => {
  await loginAs(page, 'student');
  await page.goto('/portal/#/live?tab=past');
  const held = await one(request, `select count(*)::int from sessions where batch_id = $1 and ends_at < now()`, [demo.batch.current]);
  await expect(page.locator('[data-session]')).toHaveCount(held);
  await expect(page.locator('.pill.bad:has-text("Missed")')).toHaveCount(1);
  await page.getByRole('link', { name: 'Watch recording' }).first().click();
  await expect(page).toHaveURL(/#\/recording\//);
  await expect(page.locator('.player')).toBeVisible();
  await expect(page.getByText('can’t be downloaded')).toBeVisible();
});

test('submitting an assignment: https links only, then it awaits review', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'student');
  await page.locator('[data-nav="assignments"]').click();
  const p2 = page.locator('section.assign').nth(1);
  await expect(p2.locator('.pill')).toHaveText('Not started');
  await p2.getByLabel('Link to your work').fill('http://example.com/project');
  await p2.getByRole('button', { name: 'Submit' }).click();
  await expect(p2.getByRole('alert')).toContainText('https://');
  await p2.getByLabel('Link to your work').fill('https://github.com/maya-demo/project-2');
  await p2.getByLabel(/Note for your instructor/).fill('Model card is in the README.');
  await p2.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Submitted. Your instructor will review it soon.')).toBeVisible();
  await expect(page.locator('section.assign').nth(1).locator('.pill').first()).toHaveText('Submitted · awaiting review');
  const saved = (await sql(request, `select link_url, note from submissions s join batch_assignments a on a.id = s.assignment_id
                                     where s.student_id = $1 order by a.due_at`, [demo.id.student]))[1];
  expect(saved).toEqual({ link_url: 'https://github.com/maya-demo/project-2', note: 'Model card is in the README.' });
  await expect(page.locator('section.assign').first().locator('.feedback')).toContainText('Proficient');
  expect(errors).toEqual([]);
});

test('notifications: badge, open one, mark all read; new ones arrive without reloading', async ({ page, request }) => {
  await page.clock.install();
  await loginAs(page, 'student');
  const unread = await one(request, `select count(*)::int from notifications where user_id = $1 and read_at is null`, [demo.id.student]);
  const badge = page.locator('.snav [data-badge="unread"]');
  await expect(badge).toHaveText(String(unread));
  await page.locator('[data-nav="notifications"]').click();
  await page.locator('.note.unread').first().click();
  await expect(badge).toHaveText(String(unread - 1));
  await page.locator('[data-nav="notifications"]').click();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(badge).toBeHidden();
  // Staff attach a new recording; the student's badge updates within a minute, no reload needed.
  await sql(request, `select attach_recording(id, 'demo-new') from sessions where batch_id = $1 and ends_at < now() and recording_asset_id is null
                      order by starts_at desc limit 1`, [demo.batch.current]);
  await page.clock.runFor(61_000);
  await expect(badge).toHaveText('1');
});

test('profile: names are saved and shown as plain text, never run as code', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'student');
  await page.locator('[data-nav="profile"]').click();
  const evil = '<img src=x onerror="window.__pwned=1">Maya';
  await page.getByLabel('Full name').fill(evil);
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved.')).toBeVisible();
  await expect(page.locator('[data-usermenu]')).toContainText(evil);
  await page.goto('/portal/#/home');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('<img');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await one(request, `select full_name from profiles where id = $1`, [demo.id.student])).toBe(evil);
  expect(errors).toEqual([]);
});

test('changing the password from the profile page', async ({ page }) => {
  await loginAs(page, 'student');
  await page.locator('[data-nav="profile"]').click();
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '8 characters' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('a-brand-new-password');
  await page.getByLabel('Confirm new password').fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();
});

test('lesson PDFs download; the lesson video never does', async ({ page, request }) => {
  const { readFile } = await import('node:fs/promises');
  const lessons = await lessonIds(request);
  await loginAs(page, 'student');
  await page.goto(`/portal/#/lesson/${lessons[0].id}`);
  const materials = page.getByRole('region', { name: 'Lesson materials' });
  await expect(materials.getByRole('button', { name: 'Download PDF' })).toHaveCount(2);
  await expect(materials).toContainText('Videos stream only inside the portal');
  const [download] = await Promise.all([page.waitForEvent('download'), materials.getByRole('button', { name: 'Download PDF' }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/^Lecture-notes-.*\.pdf$/);
  expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-');
  expect(await page.locator('.player a, .player video, .player [download]').count()).toBe(0);
  await page.goto('/portal/#/course');
  await expect(page.locator('a.lesson').first()).toContainText('2 PDFs');
});

test('assessment files download from the assignments page', async ({ page }) => {
  await loginAs(page, 'student');
  await page.locator('[data-nav="assignments"]').click();
  const first = page.locator('section.assign').first();
  await expect(first.getByText('Assessment files')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), first.getByRole('button', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^Assessment-brief-.*\.pdf$/);
});

test('PDF access ends the moment an enrollment is paused, and never crosses programs', async ({ page, request }) => {
  const lessons = await lessonIds(request);
  await loginAs(page, 'student');
  await page.goto(`/portal/#/lesson/${lessons[0].id}`);
  await expect(page.getByRole('button', { name: 'Download PDF' }).first()).toBeVisible();
  await sql(request, `update enrollments set status = 'paused' where student_id = $1`, [demo.id.student]);
  await page.getByRole('button', { name: 'Download PDF' }).first().click();
  await expect(page.getByText('This file isn’t available to you')).toBeVisible();

  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('about:blank');
  await loginAs(page, 'otherProgram');
  const status = await page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('nuvora.session'));
    const r = await fetch('/storage/v1/object/sign/course-files/bs-aiml/lessons/mth-110/notes.pdf', { method: 'POST',
      headers: { apikey: window.NUVORA_CONFIG.anonKey, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: '{"expiresIn":60}' });
    return r.status;
  });
  expect(status).toBe(400);
});
