// The cinematic layer of the website (site.css "cinema" and web/assets/js/cinema.js) in the browser: it may add
// motion and depth, but never hide content, shift the layout, widen the page or throw errors. Pages are read from
// /sitemap.xml, so new pages and sections from any part of the site are covered automatically.
import { test, expect } from './fixtures.mjs';

test.describe.configure({ timeout: 600_000 });   // some tests walk through every page
test.use({ reducedMotion: 'no-preference' });      // the rest of the suite runs with reduced motion (playwright.config.mjs)

async function sitemapPaths(request) {
  const r = await request.get('/sitemap.xml');
  expect(r.ok()).toBeTruthy();
  const paths = [...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(paths.length).toBeGreaterThan(5);
  return paths;
}

/** Console errors and page errors, each with the page it happened on (Google Fonts is optional and is ignored). */
function watchErrors(page) {
  const errors = [];
  const at = () => new URL(page.url()).pathname;
  page.on('pageerror', (e) => errors.push(`${at()}: pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '')) errors.push(`${at()}: console: ${m.text()}`); });
  return errors;
}

// The cinema animations by name: cine-rise (sections and cards), cine-wipe (headings), cine-kb / cine-push (photos),
// cine-drift (glows), cine-par (hero footage).
const CINE = /^cine-/;

// Every visible piece of content in main whose own or inherited opacity is below 1, or which is clipped or moved by
// a cinema animation. Run with motion off, this must be empty everywhere on the page.
const hiddenContent = (page) => page.evaluate(() => {
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).trim().split(/\s+/)[0]} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
  const found = [];
  for (const el of document.querySelectorAll('main *')) {
    if (el.closest('[hidden], [aria-hidden="true"], template, .vstage, .sr-only') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (Number(cs.opacity) < 1 && el.closest('section, .psec')) {
      // A deliberately faint decoration (an inline opacity or a component's own style) is not a cinema problem;
      // only report what an animation dimmed.
      if (el.getAnimations().length) found.push(`${name(el)} opacity ${cs.opacity}`);
    }
    if (cs.clipPath !== 'none' && el.getAnimations().length) found.push(`${name(el)} clip-path ${cs.clipPath}`);
  }
  return found;
});

test('reduced motion: every section of every page is fully visible and nothing animates', async ({ browser, request }) => {
  const paths = await sitemapPaths(request);
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  const problems = [];
  for (const path of paths) {
    await page.goto(path);
    const state = await page.evaluate(() => {
      const running = document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'paused');
      const units = [...document.querySelectorAll('main section *')].filter((el) => {
        const cs = getComputedStyle(el);
        return cs.animationName !== 'none' && cs.animationName !== '';
      });
      return { running: running.map((a) => a.animationName || a.constructor.name), styled: units.length };
    });
    if (state.running.length) problems.push(`${path}: animations still run: ${[...new Set(state.running)].join(', ')}`);
    if (state.styled) problems.push(`${path}: ${state.styled} elements still have an animation-name`);
    for (const p of await hiddenContent(page)) problems.push(`${path}: ${p}`);
    // Every section heading and card is at full opacity and not wiped shut (a shaped clip-path, such as the
    // certificate ribbon's, is design, not a reveal), wherever it is on the page.
    const dim = await page.evaluate(() => [...document.querySelectorAll('main :is(section h2, article, figure, [class*="card"])')]
      .filter((el) => el.checkVisibility({ contentVisibilityAuto: true }))
      .filter((el) => { const cs = getComputedStyle(el); return Number(cs.opacity) < 1 || /^inset\(.*100%/.test(cs.clipPath); })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} dimmed or clipped`).slice(0, 5));
    problems.push(...dim.map((d) => `${path}: ${d}`));
  }
  await context.close();
  expect(problems, problems.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('with motion: the cinema layer runs, and every section and card is fully visible once scrolled into view', async ({ page, request }) => {
  const paths = await sitemapPaths(request);
  const errors = watchErrors(page);
  const problems = [];
  for (const path of paths) {
    await page.goto(path);
    const result = await page.evaluate(async (cine) => {
      const re = new RegExp(cine);
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).trim().split(/\s+/)[0]} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
      const opacity = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
      const anims = document.getAnimations().filter((a) => re.test(a.animationName));
      const units = [...new Set(anims.filter((a) => /^cine-(rise|wipe)$/.test(a.animationName)).map((a) => a.effect.target))]
        .filter((el) => el.checkVisibility({ contentVisibilityAuto: true }));   // not inside a closed <details>
      const bad = [];
      for (const el of units) {
        el.scrollIntoView({ block: 'center' });
        await frame();
        const o = opacity(el);
        const cs = getComputedStyle(el);
        if (o < 0.99) bad.push(`${name(el)} opacity ${o.toFixed(2)}`);
        else if (cs.clipPath !== 'none' && !/inset\(-/.test(cs.clipPath)) bad.push(`${name(el)} still clipped: ${cs.clipPath}`);
      }
      // The bottom of the page too: the last sections must finish their reveal above the footer.
      window.scrollTo(0, document.documentElement.scrollHeight);
      await frame();
      for (const el of units) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.bottom <= innerHeight && opacity(el) < 0.99) bad.push(`${name(el)} faded at the bottom of the page`);
      }
      window.scrollTo(0, 0);
      return { names: [...new Set(anims.map((a) => a.animationName))], units: units.length, bad };
    }, CINE.source);
    if (!result.names.includes('cine-rise')) problems.push(`${path}: no reveal animation (cine-rise) on the page`);
    problems.push(...result.bad.map((b) => `${path}: ${b}`));
  }
  expect(problems, problems.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('with motion: whatever has come to rest on screen, and whatever Tab focuses, is fully shown; eyebrows never cross headings', async ({ page }) => {
  const errors = watchErrors(page);
  const problems = [];
  const opacity = `(el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; }`;
  for (const path of ['/', '/tuition/', '/programs/bs-data-science/']) {
    await page.goto(path);
    // Keyboard focus often lands just inside the bottom edge, where a scroll-linked reveal is least advanced.
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(`(() => { const el = document.activeElement; if (!el || !el.closest('main') || el.matches('.f-opt input')) return null;
        const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return null;
        return { o: (${opacity})(el), what: el.tagName + ' "' + (el.textContent || '').trim().slice(0, 30) + '"', top: Math.round(r.top) }; })()`);
      if (f && f.o < 0.99) problems.push(`${path}: focused ${f.what} at y=${f.top} has opacity ${f.o.toFixed(2)}`);
    }
    // At rest: after scrolling stops, anything more than 100px above the bottom edge is fully shown and unclipped.
    const rest = await page.evaluate(`(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      document.activeElement?.blur();
      const units = [...new Set(document.getAnimations().filter((a) => /^cine-(rise|wipe|fade)$/.test(a.animationName)).map((a) => a.effect.target))];
      const bad = [];
      for (let y = 0; y < document.documentElement.scrollHeight; y += 650) {
        window.scrollTo(0, y); await frame();
        for (const el of units) {
          const r = el.getBoundingClientRect();
          if (r.top < 0 || r.bottom > innerHeight - 100 || !r.height || !el.checkVisibility()) continue;
          const o = (${opacity})(el), cp = getComputedStyle(el).clipPath;
          if (o < 0.99) bad.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" at y=' + Math.round(r.top) + ' opacity ' + o.toFixed(2));
          else if (cp !== 'none' && !/inset\\(-[^ ]+ calc\\(0% /.test(cp) && !/inset\\(-[^ ]+ -/.test(cp)) bad.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" still clipped: ' + cp);
        }
      }
      // Section heads entering from the bottom, 30px at a time: the eyebrow fades in place above the heading.
      for (const sh of document.querySelectorAll('main section:not(.hero,.phero,.pagehead) .shead')) {
        const e = sh.querySelector('.eyebrow'), h = sh.querySelector('h2');
        if (!e || !h) continue;
        const top = sh.getBoundingClientRect().top + scrollY;
        for (let s = 0; s < 8; s++) {
          window.scrollTo(0, top - innerHeight + s * 30); await frame();
          if (e.getBoundingClientRect().bottom > h.getBoundingClientRect().top + 1) { bad.push('eyebrow "' + e.textContent.trim() + '" slides over its heading'); break; }
        }
      }
      window.scrollTo(0, 0);
      return bad;
    })()`);
    problems.push(...rest.map((b) => `${path}: ${b}`));
  }
  expect(problems, problems.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('home with motion: headings wipe in, photos drift, light sections glow and the hero footage has parallax', async ({ page }) => {
  await page.goto('/');
  const names = await page.evaluate(() => [...new Set(document.getAnimations().map((a) => a.animationName))]);
  for (const n of ['cine-rise', 'cine-wipe', 'cine-kb', 'cine-drift', 'cine-par']) expect(names, `missing ${n}`).toContain(n);
  // Chapter numbers come from a CSS counter on the section eyebrows ("01", "02", … in page order), with empty
  // alternative text so screen readers skip them.
  const chapters = await page.evaluate(() => ({
    reset: getComputedStyle(document.querySelector('main')).counterReset,
    eyebrows: [...document.querySelectorAll('main .shead .eyebrow')].map((el) => getComputedStyle(el, '::before'))
      .map((cs) => `${cs.counterIncrement} | ${cs.content}`),
  }));
  expect(chapters.reset).toMatch(/^chapter\b/);
  expect(chapters.eyebrows.length).toBeGreaterThan(3);
  for (const e of chapters.eyebrows) expect(e).toBe('chapter 1 | counter(chapter, decimal-leading-zero) / ""');
  // The hero headline is never part of a reveal (it is the page's largest paint).
  const h1 = await page.locator('.hero h1').evaluate((el) => ({ o: getComputedStyle(el).opacity, a: el.getAnimations().length }));
  expect(h1).toEqual({ o: '1', a: 0 });
});

test('the spotlight follows a mouse over a dark chapter, and stays off with reduced motion', async ({ browser }) => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ reducedMotion, viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    await page.goto('/how-it-works/');
    const head = page.locator('main .pagehead').first();
    const box = await head.boundingBox();
    await page.mouse.move(box.x + 300, box.y + 290);
    await page.mouse.move(box.x + 320, box.y + 300, { steps: 4 });
    const state = await head.evaluate((el) => ({ lit: el.classList.contains('is-lit'), x: el.style.getPropertyValue('--spot-x'),
      glow: getComputedStyle(el, '::after').content }));
    if (reducedMotion === 'reduce') expect(state).toEqual({ lit: false, x: '', glow: 'none' });
    else {
      expect(state.lit).toBe(true);
      expect(state.x).toBe('320px');
    }
    await context.close();
  }
});

test('no horizontal scrolling at 320px on any page, with motion, after scrolling through', async ({ browser, request }) => {
  const paths = await sitemapPaths(request);
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  const problems = [];
  for (const path of paths) {
    await page.goto(path);
    const wide = await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise(requestAnimationFrame); }
      // Try to scroll sideways: the page must not move.
      window.scrollTo(200, window.scrollY);
      const moved = window.scrollX;
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, moved };
    });
    if (wide.sw > wide.cw || wide.bw > wide.cw || wide.moved) problems.push(`${path}: ${JSON.stringify(wide)}`);
  }
  await context.close();
  expect(problems, problems.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

// 320px too: a narrow hero is where a web font swapping in would rewrap the headline and push the content below it down.
for (const width of [1366, 320]) test(`home at ${width}px: cumulative layout shift stays under 0.05 while loading and scrolling through`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 760 : 860 });
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 240) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
  const cls = await page.evaluate(() => window.__cls);
  expect(cls).toBeLessThan(0.05);
  expect(errors, errors.join('\n')).toEqual([]);
});
