// The white logo intro in the browser (web/assets/css/intro.css, js/intro-gate.js, js/intro.js), as a first-time
// visitor with motion on: it plays once per browser session on whichever page the visit starts, ends by itself
// within 3.7 s, can be skipped with a click, a tap or a key, never shows with reduced motion, never traps focus and
// never moves the page underneath. The stylesheet side is tests/site/intro.test.mjs.
import { test, expect } from './fixtures.mjs';

test.use({ firstVisit: true, reducedMotion: 'no-preference' });

const INTRO = '[data-intro]';

// Recorded in the page from the very first frame, so nothing depends on how quickly the test itself runs: whether
// the overlay was on screen (and on the first frame, before the first paint), how it looked, the page underneath
// while it played, when "nuvora:intro-done" arrived and with what detail, layout shifts and largest paints.
function record() {
  window.__intro = { firstFrame: null, seen: false, seenAt: null, look: null, during: null, wide: false, done: null, input: null, cls: 0, lcp: [] };
  const I = window.__intro;
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { I.input ??= performance.now(); }, true);
  const sample = () => {
    const el = document.querySelector('[data-intro]');
    const on = !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    if (I.firstFrame === null && el) I.firstFrame = on;   // the first frame with the overlay parsed
    if (on) {
      const de = document.documentElement;
      const mark = el.querySelector('.intro-mark').getBoundingClientRect();
      const h1 = document.querySelector('main h1');
      I.wide ||= de.scrollWidth > de.clientWidth;
      // The last frame on screen, when the page underneath has loaded: the headline painted, fully opaque, at once.
      I.during = { h1: h1 && getComputedStyle(h1).opacity, markFits: mark.left >= 0 && mark.right <= innerWidth };
      if (!I.seen) {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        I.look = { display: cs.display, position: cs.position, bg: cs.backgroundColor, hidden: el.getAttribute('aria-hidden'),
          covers: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight };
      }
      I.seen = true;
    }
    // When its animation really started: the first frame can be painted later than this callback runs.
    if (on && I.seenAt === null) I.seenAt = el.getAnimations()[0]?.startTime ?? null;
    if (!I.done) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  document.addEventListener('nuvora:intro-done', (e) => { I.done = { t: performance.now(), ...e.detail }; });
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) I.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) I.lcp.push({ t: e.startTime, intro: !!e.element?.closest('[data-intro]'), tag: e.element?.tagName ?? null });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
}

/** Console errors and page errors (Google Fonts is answered locally by the fixtures and is ignored). */
function watchErrors(page, errors = []) {
  const at = () => new URL(page.url()).pathname;
  page.on('pageerror', (e) => errors.push(`${at()}: pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '')) errors.push(`${at()}: console: ${m.text()}`); });
  return errors;
}

// A new tab has its own sessionStorage, so it starts a new visit, as a new window would.
async function newVisit(context, errors) {
  const page = await context.newPage();
  await page.addInitScript(record);
  watchErrors(page, errors);
  return page;
}

// A brand-new browser context that stays on this computer, like the one the fixtures give each test.
async function freshContext(browser, options = {}) {
  const context = await browser.newContext(options);
  await context.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname) && !/^(data|blob):$/.test(url.protocol), (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' });
    if (hostname === 'fonts.gstatic.com') return route.fulfill({ status: 204, body: '' });
    return route.abort('blockedbyclient');
  });
  return context;
}

// The intro played at a tenth of its speed (Chromium's DevTools animation rate), so a test can act while it is on
// screen however busy the computer is. Set on the blank tab, it stays for the pages the tab opens. Returns a
// function that puts the speed back to normal (just before the test skips, so the skip itself runs in real time).
async function slowMotion(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  return () => cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
}

const ended = (page) => page.waitForFunction(() => window.__intro.done, null, { timeout: 8000 }).then(() => page.evaluate(() => window.__intro));

test('the intro plays on the first page of a visit, whichever page that is, and is gone within 3.7 s', async ({ context }) => {
  const errors = [];
  for (const path of ['/', '/programs/', '/programs/bs-data-science/', '/tuition/', '/about/', '/learn/sample-lesson/']) {
    const page = await newVisit(context, errors);
    await page.goto(path);
    const intro = await ended(page);
    // While it played it covered the whole window, white, with the wordmark in the middle, hidden from screen readers.
    expect(intro.look, path).toEqual({ display: 'grid', position: 'fixed', bg: 'rgb(255, 255, 255)', hidden: 'true', covers: true });
    expect(intro.seen && intro.firstFrame, `${path}: shown from the first frame`).toBe(true);
    expect(intro.done, path).toMatchObject({ shown: true, skipped: false });
    // Counted from its first frame on screen, when its animation started (the page's loading time is not the intro's).
    expect(intro.done.t - intro.seenAt, `${path}: on screen from ${Math.round(intro.seenAt)} to ${Math.round(intro.done.t)} ms`).toBeLessThan(3700);
    await expect(page.locator(INTRO)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-intro-done'))).toBe(true);
    await page.close();
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('later pages of the same visit show no intro, not even for one frame; a new browser context plays it again', async ({ page, browser }) => {
  const errors = watchErrors(page);
  await page.addInitScript(record);
  await page.goto('/');
  expect((await ended(page)).done.shown).toBe(true);
  for (const path of ['/tuition/', '/programs/', '/']) {
    await page.goto(path);
    const intro = await ended(page);
    expect({ firstFrame: !!intro.firstFrame, seen: intro.seen, shown: intro.done.shown }, path).toEqual({ firstFrame: false, seen: false, shown: false });
    expect(await page.evaluate(() => document.documentElement.classList.contains('intro-off')), path).toBe(true);
    await expect(page.locator(INTRO)).toHaveCount(0);
  }
  // Back and forward too.
  await page.goBack();
  await expect(page.locator(INTRO)).toHaveCount(0);

  const context = await freshContext(browser);
  const again = await newVisit(context, errors);
  await again.goto('/programs/');
  const intro = await ended(again);
  expect(intro.seen).toBe(true);
  expect(intro.done.shown).toBe(true);
  await context.close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a click or tap skips it at once, and does not reach the page underneath', async ({ context }) => {
  const errors = [];
  const page = await newVisit(context, errors);
  const realSpeed = await slowMotion(page);
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__intro.seen);
  // The middle of the window, where the hero sits under the overlay.
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await realSpeed();
  await page.mouse.click(Math.round(w * 0.3), Math.round(h * 0.6));
  const intro = await ended(page);
  expect(intro.done).toMatchObject({ shown: true, skipped: true });
  expect(intro.done.t - intro.input, 'gone within 0.4 s of the click').toBeLessThan(400);
  await expect(page.locator(INTRO)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a key skips it; focus is never trapped and the skip link still works', async ({ context }) => {
  const errors = [];
  const page = await newVisit(context, errors);
  const realSpeed = await slowMotion(page);
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__intro.seen);
  // Nothing inside the overlay can take focus.
  expect(await page.locator(`${INTRO} a, ${INTRO} button, ${INTRO} input, ${INTRO} [tabindex]`).count()).toBe(0);
  await realSpeed();
  await page.keyboard.press('Tab');
  const intro = await ended(page);
  expect(intro.done).toMatchObject({ shown: true, skipped: true });
  expect(intro.done.t - intro.input, 'gone within 0.4 s of the key press').toBeLessThan(400);
  // The same Tab press moved focus to the skip link, which is visible and works.
  const skip = page.locator('a.skip');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a page opened in a background tab keeps the intro until it is first shown, then plays it in full', async ({ context }) => {
  const page = await context.newPage();
  // The page believes it is hidden (a background tab) until window.__show() makes it visible.
  await page.addInitScript(() => {
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    window.__show = () => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); };
  });
  await page.goto('/');
  await page.waitForTimeout(4500);   // longer than the whole intro: nothing may have played unseen
  expect(await page.evaluate(() => ({ inDom: !!document.querySelector('[data-intro]'), done: document.documentElement.hasAttribute('data-intro-done') })))
    .toEqual({ inDom: true, done: false });
  await page.evaluate(() => window.__show());
  await expect(page.locator(INTRO)).toBeVisible();
  await expect(page.locator(INTRO)).toHaveCount(0, { timeout: 4500 });
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-intro-done'))).toBe(true);
});

test('with reduced motion the intro never shows, and the page is ready at once', async ({ browser }) => {
  const errors = [];
  const context = await freshContext(browser, { reducedMotion: 'reduce' });
  for (const path of ['/', '/how-it-works/']) {
    const page = await newVisit(context, errors);
    await page.goto(path);
    const intro = await ended(page);
    expect({ firstFrame: !!intro.firstFrame, seen: intro.seen, shown: intro.done.shown }, path).toEqual({ firstFrame: false, seen: false, shown: false });
    expect(intro.done.t, path).toBeLessThan(3700);
    await expect(page.locator(INTRO)).toHaveCount(0);
  }
  await context.close();
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const [width, height] of [[1280, 860], [390, 844], [320, 720]]) {
  test(`at ${width}px: nothing underneath shifts, the hero headline is the largest paint and nothing scrolls sideways`, async ({ context }) => {
    const errors = [];
    const page = await newVisit(context, errors);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const intro = await ended(page);
    expect(intro.done.shown).toBe(true);
    // While the intro played: the hero headline had painted underneath, the mark fitted, nothing scrolled sideways.
    expect({ ...intro.during, wide: intro.wide }).toEqual({ h1: '1', markFits: true, wide: false });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ ...window.__intro, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
    expect(after.cls, `CLS ${after.cls}`).toBeLessThan(0.05);
    expect(after.wide).toBe(false);
    expect(after.lcp.length).toBeGreaterThan(0);
    expect(after.lcp.at(-1).intro, `largest paint: ${JSON.stringify(after.lcp)}`).toBe(false);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
