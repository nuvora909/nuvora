// Layout and accessibility basics on phone and desktop sizes, in light and dark mode.
import { test, expect } from '@playwright/test';
import { reset, loginAs } from './helpers.mjs';

test.beforeEach(async ({ request }) => { await reset(request); });
test.describe.configure({ timeout: 180_000 });   // these tests walk through many pages each

const PAGES = ['#/home', '#/course', '#/live', '#/live?tab=past', '#/assignments', '#/notifications', '#/profile'];

// Elements that stick out past the right edge of the screen. The page hides sideways scrolling, so
// scrollWidth alone would not reveal clipped content; check every element's box instead. Containers that
// are meant to scroll sideways (the phone menu, wide tables) are skipped.
const cutOff = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll('body *')]
    .filter((el) => !el.closest('.sidebar, .tablewrap, .tabs') && el.getClientRects().length)
    .filter((el) => el.getBoundingClientRect().right > vw + 1)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 30)}"`)
    .slice(0, 10);
});

async function checkPage(page, label) {
  await expect(page.locator('main h1, .auth-card h1').first()).toBeVisible();
  expect(await cutOff(page), `${label}: nothing runs off the right edge`).toEqual([]);
  expect(await page.locator('h1').count(), `${label}: one main heading`).toBe(1);
  const nav = (await page.locator('.sidebar').count()) ? await page.locator('.sidebar').boundingBox() : null;
  const vw = page.viewportSize().width;
  if (nav && vw <= 900) expect(nav.height, `${label}: phone menu stays one slim row`).toBeLessThanOrEqual(80);
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
    .filter((el) => !el.labels?.length && !el.getAttribute('aria-label')).map((el) => el.outerHTML.slice(0, 80)));
  expect(unlabeled, `${label}: every field has a label`).toEqual([]);
  const nameless = await page.evaluate(() => [...document.querySelectorAll('button, a[href]')]
    .filter((el) => !(el.textContent.trim() || el.getAttribute('aria-label') || el.title)).map((el) => el.outerHTML.slice(0, 80)));
  expect(nameless, `${label}: every button and link has a name`).toEqual([]);
  const noAlt = await page.locator('img:not([alt])').count();
  expect(noAlt, `${label}: images have alt text`).toBe(0);
}

for (const size of [{ name: 'phone', width: 390, height: 844 }, { name: 'small phone', width: 320, height: 640 }, { name: 'tablet', width: 820, height: 1180 }]) {
  test(`student pages fit a ${size.name} screen (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/portal/#/login');
    await checkPage(page, `login @${size.width}`);
    await loginAs(page, 'student');
    for (const p of PAGES) {
      await page.goto(`/portal/${p}`);
      await checkPage(page, `${p} @${size.width}`);
    }
    await page.goto('/portal/#/course');
    await page.locator('a.lesson').first().click();
    await checkPage(page, `lesson @${size.width}`);
    await page.screenshot({ path: `test-results/screens/lesson-${size.width}.png`, fullPage: true });
  });
}

test('short pages keep the phone menu slim (new student, nothing yet)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'newcomer');
  await expect(page.getByText('You’re not enrolled in a batch yet')).toBeVisible();
  await checkPage(page, 'not enrolled home');
  await page.goto('/portal/#/notifications');
  await expect(page.getByText('No notifications yet')).toBeVisible();
  await checkPage(page, 'empty notifications');
});

test('staff pages fit a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'instructor');
  for (const p of ['#/teach', '#/grading']) {
    await page.goto(`/portal/${p}`);
    await checkPage(page, p);
  }
  await page.locator('[data-nav="teach"]').click();
  await page.getByRole('link', { name: /Roster/ }).first().click();
  await expect(page.locator('main h1')).toContainText('roster');
  expect(await cutOff(page)).toEqual([]);
});

test('dark mode uses the dark palette', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await loginAs(page, 'student');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(8, 16, 31)');
  await page.screenshot({ path: 'test-results/screens/home-dark.png' });
});

test('desktop screenshots for review', async ({ page }) => {
  await loginAs(page, 'student');
  await page.screenshot({ path: 'test-results/screens/home-desktop.png', fullPage: true });
  await page.goto('/portal/#/assignments');
  await page.screenshot({ path: 'test-results/screens/assignments-desktop.png', fullPage: true });
});
