// Layout and accessibility basics for every page in the sitemap, from a 320px phone to a desktop, plus the phone
// menu and the dark colour scheme. Pages are read from /sitemap.xml, so new pages are covered automatically.
import { test, expect } from './fixtures.mjs';

test.describe.configure({ timeout: 600_000 });   // each test walks through every page

const WIDTHS = [320, 360, 390, 768, 1280];
const PHONE = 390;   // up to this width, iOS Jitsis into form fields with text smaller than 16px

async function sitemapPaths(request) {
  const r = await request.get('/sitemap.xml');
  expect(r.ok()).toBeTruthy();
  const paths = [...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(paths.length).toBeGreaterThan(5);
  return paths;
}

// Console errors and page errors, each with the page it happened on. Google Fonts is optional and is ignored.
function watchErrors(page) {
  const errors = [];
  const at = () => new URL(page.url()).pathname;
  page.on('pageerror', (e) => errors.push(`${at()}: pageerror: ${e.message}`));
  page.on('console', (m) => {
    const url = m.location().url || '';
    if (m.type() === 'error' && !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(url)) errors.push(`${at()}: console: ${m.text()}`);
  });
  return errors;
}

// The same problem on many pages (a shared header or footer) is reported once, with the pages it is on.
function summary(found, width) {
  const byProblem = new Map();
  for (const [path, problem] of found) byProblem.set(problem, [...(byProblem.get(problem) ?? []), path]);
  return [...byProblem].map(([problem, paths]) => `@${width} ${problem} on ${paths.length === 1 ? paths[0]
    : `${paths.length} pages: ${paths.slice(0, 4).join(', ')}${paths.length > 4 ? ', …' : ''}`}`);
}

// Everything one page must get right at the current width. Returns a list of problems.
const inspect = (page, { phone }) => page.evaluate(({ phone }) => {
  const problems = [];
  const vw = document.documentElement.clientWidth;
  // checkVisibility() also sees content the browser skips, such as the inside of a closed <details> menu, which
  // still reports a layout box.
  const shown = (el) => el.getClientRects().length > 0
    && el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className?.baseVal ?? el.className).trim().split(/\s+/)[0]} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;

  if (document.compatMode !== 'CSS1Compat') problems.push(`renders in ${document.compatMode} (quirks mode)`);

  // Nothing sticks out sideways. The page hides horizontal scrolling, so scrollWidth alone would not reveal clipped
  // content: check every element's box. Horizontal scrollers and decoration hidden from assistive tech are skipped.
  const SCROLLERS = '.tabs, .tablewrap, .jumpnav nav, [aria-hidden="true"], .skip, .sr-only';
  const out = [...document.querySelectorAll('body *')]
    .filter((el) => !el.closest(SCROLLERS) && shown(el))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
    .map((el) => `sticks out: ${name(el)} (${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)} of ${vw})`);
  problems.push(...out.slice(0, 8));

  // Text fields at least 16px on phones (smaller makes iOS Jitsi in on focus). Check boxes, radios, sliders and
  // buttons hold no typed text.
  if (phone) {
    const NO_TEXT = ['hidden', 'checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image'].map((t) => `:not([type=${t}])`).join('');
    for (const el of document.querySelectorAll(`input${NO_TEXT}, select, textarea`)) {
      if (!shown(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) problems.push(`field text ${fs}px: ${name(el)}`);
    }
  }

  // Every link and button is a target of at least 24 x 24 CSS pixels (WCAG 2.5.8), except links inside a sentence.
  for (const el of document.querySelectorAll('a[href], button')) {
    if (!shown(el) || el.closest('.sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 24 && r.height >= 24) continue;
    const inline = getComputedStyle(el).display === 'inline' && (el.parentElement?.textContent.trim().length ?? 0) > el.textContent.trim().length;
    if (!inline) problems.push(`target ${Math.round(r.width)}x${Math.round(r.height)}: ${name(el)}`);
  }

  // Basic labelling.
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) problems.push(`unlabelled field: ${name(el)}`);
  }
  for (const el of document.querySelectorAll('a[href], button')) {
    if (!(el.textContent.trim() || el.getAttribute('aria-label') || el.title)) problems.push(`nameless control: ${el.outerHTML.slice(0, 80)}`);
  }
  for (const img of document.querySelectorAll('img:not([alt])')) problems.push(`image without alt: ${img.getAttribute('src')}`);
  if (document.querySelectorAll('h1').length !== 1) problems.push(`${document.querySelectorAll('h1').length} h1 elements`);
  return problems;
}, { phone });

for (const width of WIDTHS) {
  test(`every page fits and works at ${width}px`, async ({ page, request }) => {
    const paths = await sitemapPaths(request);
    await page.setViewportSize({ width, height: width < 768 ? 780 : 900 });
    const errors = watchErrors(page);
    const found = [];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      for (const p of await inspect(page, { phone: width <= PHONE })) found.push([path, p]);
    }
    // Soft, so the phone menu below is still checked when a page has a problem.
    expect.soft(summary(found, width), 'layout and accessibility problems').toEqual([]);
    expect.soft(errors, 'console errors').toEqual([]);

    // The phone menu (shown below 900px) opens, lists Student login and closes with Escape.
    const menu = page.locator('details[data-mnav]');
    const toggle = menu.locator('summary');
    if (width < 900) {
      await page.goto('/');
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(menu).toHaveAttribute('open', '');
      const login = menu.getByRole('link', { name: 'Student login' });
      await expect(login).toBeVisible();
      await expect(login).toHaveAttribute('href', '/portal/');
      const open = (await inspect(page, { phone: width <= PHONE })).map((p) => ['/ (menu open)', p]);
      expect.soft(summary(open, width), 'problems with the menu open').toEqual([]);
      await page.keyboard.press('Escape');
      await expect(menu).not.toHaveAttribute('open', '');
      await expect(toggle).toBeFocused();
      await expect(page.locator('.msheet')).toBeHidden();
    } else {
      await expect(toggle).toBeHidden();
    }
  });
}

test('every page renders in the dark colour scheme without errors', async ({ page, request }) => {
  const paths = await sitemapPaths(request);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 780 });
  const errors = watchErrors(page);
  const light = [];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    if (0.2126 * r + 0.7152 * g + 0.0722 * b > 60) light.push(`${path}: body background ${bg}`);
  }
  expect(light).toEqual([]);
  expect(errors).toEqual([]);
});

