// The program guides and the brochure viewer in the browser: the guide loads cleanly, the picker and the 3D preview
// work, and the brochure turns page by page with the buttons, the keys, a drag, the address (#page-N) and "Show all
// pages", announces each page, animates only when motion is allowed, fits phones without sideways scroll, works
// without JavaScript and prints one page per A4 sheet without the site around it.
import { test, expect } from './fixtures.mjs';
import { watchErrors } from './helpers.mjs';
import { PROGRAMS } from '../../web/data/programs.mjs';
import { brochurePages } from '../../web/pages/brochure.mjs';

const P = (id) => PROGRAMS.find((p) => p.id === id);
const BS = P('bs-ds');
const TOTAL = brochurePages(BS).length;
const brochure = (p = BS, hash = '') => `${p.url}brochure/${hash}`;

/** The viewer's state as a visitor sees it. */
const viewerState = (page) => page.evaluate(() => {
  const shown = [...document.querySelectorAll('.gb-page')].filter((el) => el.getClientRects().length > 0).map((el) => el.id);
  return {
    count: document.querySelector('[data-gb-count]').textContent,
    live: document.querySelector('[data-gb-live]').textContent,
    hash: location.hash,
    shown,
    prevOff: document.querySelector('[data-gb-prev]').getAttribute('aria-disabled'),
    nextOff: document.querySelector('[data-gb-next]').getAttribute('aria-disabled'),
  };
});

/** Elements that stick out of the viewport sideways (decoration and contained scrollers excepted). */
const sideways = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [...document.querySelectorAll('body *')]
    .filter((el) => !el.closest('[aria-hidden="true"], [data-hscroll], .sr-only, .skip') && el.getClientRects().length && el.checkVisibility({ visibilityProperty: true }))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().right)}/${vw}`);
  return { page: document.documentElement.scrollWidth - vw, out: out.slice(0, 5) };
});

test('every guide loads without console errors, with one h1 and its hero render', async ({ page }) => {
  const errors = watchErrors(page);
  for (const p of PROGRAMS) {
    await page.goto(`${p.url}guide/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.name);
    const hero = page.getByRole('img', { name: `3D illustration of the ${p.name} program guide` });
    await expect(hero).toBeVisible();
    expect(await hero.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('h1')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('the picker opens another program’s guide and marks the current one', async ({ page }) => {
  await page.goto(`${BS.url}guide/`);
  const picker = page.getByRole('navigation', { name: 'Program guides' });
  await expect(picker.getByRole('link')).toHaveCount(PROGRAMS.length);
  await expect(picker.locator('[aria-current="page"]')).toHaveText(BS.short);
  await picker.getByRole('link', { name: P('ms-aml').short }).click();
  await expect(page).toHaveURL(new RegExp(`${P('ms-aml').url}guide/$`));
  await expect(page.getByRole('navigation', { name: 'Program guides' }).locator('[aria-current="page"]')).toHaveText(P('ms-aml').short);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(P('ms-aml').name);
});

test('"3D preview" on the guide opens the existing 3D dialog, and Escape returns focus to the button', async ({ page }) => {
  const errors = watchErrors(page);
  const p = P('c-genai');
  await page.goto(`${p.url}guide/`);
  const button = page.getByRole('button', { name: `3D preview of the ${p.name} program guide` }).first();
  await button.click();
  const dialog = page.getByRole('dialog', { name: `3D preview: ${p.name}` });
  await expect(dialog).toBeVisible();
  await expect(page.locator('dialog.p3d')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  expect(errors).toEqual([]);
});

test('the viewer turns with Previous and Next, keeps the counter, the live region and #page-N in step', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(brochure());
  let s = await viewerState(page);
  expect(s).toMatchObject({ count: `Page 1 of ${TOTAL}`, shown: ['page-1'], prevOff: 'true', nextOff: 'false' });
  const next = page.getByRole('button', { name: 'Next page' });
  const prev = page.getByRole('button', { name: 'Previous page' });
  for (const b of [next, prev, page.getByRole('button', { name: 'Show all pages' }), page.getByRole('button', { name: 'Print this brochure' })]) {
    expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await next.click();
  s = await viewerState(page);
  expect(s).toMatchObject({ count: `Page 2 of ${TOTAL}`, hash: '#page-2', shown: ['page-2'], prevOff: 'false' });
  expect(s.live).toBe(`Page 2 of ${TOTAL}: Is it right for you?`);
  await expect(page.locator('[data-gb-live]')).toHaveAttribute('aria-live', 'polite');
  await prev.click();
  s = await viewerState(page);
  expect(s).toMatchObject({ count: `Page 1 of ${TOTAL}`, hash: '#page-1', shown: ['page-1'], prevOff: 'true' });
  await prev.click({ force: true });   // aria-disabled at the first page: nothing happens
  expect((await viewerState(page)).count).toBe(`Page 1 of ${TOTAL}`);
  expect(errors).toEqual([]);
});

test('the viewer is reached with Tab and turns with the arrow keys, Page Up / Page Down, Home and End', async ({ page }) => {
  await page.goto(brochure());
  const viewer = page.getByRole('region', { name: /^Brochure, \d+ pages/ });
  // The keyboard reaches the viewer: Tab from the last control before it (not focus() from a script).
  await page.getByRole('button', { name: 'Print this brochure' }).focus();
  await page.keyboard.press('Tab');
  await expect(viewer).toBeFocused();
  const at = async () => (await viewerState(page)).count;
  await page.keyboard.press('ArrowRight');
  expect(await at()).toBe(`Page 2 of ${TOTAL}`);
  await page.keyboard.press('PageDown');
  expect(await at()).toBe(`Page 3 of ${TOTAL}`);
  await page.keyboard.press('ArrowLeft');
  expect(await at()).toBe(`Page 2 of ${TOTAL}`);
  await page.keyboard.press('End');
  expect(await at()).toBe(`Page ${TOTAL} of ${TOTAL}`);
  expect((await viewerState(page)).nextOff).toBe('true');
  await page.keyboard.press('PageUp');
  expect(await at()).toBe(`Page ${TOTAL - 1} of ${TOTAL}`);
  await page.keyboard.press('Home');
  expect(await at()).toBe(`Page 1 of ${TOTAL}`);
  expect((await viewerState(page)).hash).toBe('#page-1');
});

test('a sideways drag turns the page; a vertical one does not', async ({ page }) => {
  await page.goto(brochure());
  const box = await page.locator('#page-1').boundingBox();
  const y = box.y + Math.min(box.height / 2, 300);
  const drag = async (dx, dy = 0) => {
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };
  await drag(-220);
  expect((await viewerState(page)).count).toBe(`Page 2 of ${TOTAL}`);
  await drag(220);
  expect((await viewerState(page)).count).toBe(`Page 1 of ${TOTAL}`);
  await drag(-20, 160);
  expect((await viewerState(page)).count).toBe(`Page 1 of ${TOTAL}`);
  // Far enough sideways to be a swipe, but mostly vertical: a scroll, not a turn.
  await drag(-80, 160);
  expect((await viewerState(page)).count).toBe(`Page 1 of ${TOTAL}`);
});

test('a link to #page-3 opens the viewer at page 3, and a changed hash turns to that page', async ({ page }) => {
  await page.goto(brochure(BS, '#page-3'));
  let s = await viewerState(page);
  expect(s).toMatchObject({ count: `Page 3 of ${TOTAL}`, hash: '#page-3', shown: ['page-3'] });
  await page.evaluate(() => { location.hash = '#page-5'; });
  await expect(page.locator('[data-gb-count]')).toHaveText(`Page 5 of ${TOTAL}`);
  s = await viewerState(page);
  expect(s.shown).toEqual(['page-5']);
});

test('"Show all pages" stacks every page and turns the viewer back on', async ({ page }) => {
  await page.goto(brochure(BS, '#page-2'));
  const all = page.getByRole('button', { name: 'Show all pages' });
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  let s = await viewerState(page);
  expect(s.shown).toHaveLength(TOTAL);
  expect(s).toMatchObject({ count: `All ${TOTAL} pages`, prevOff: 'true', nextOff: 'true' });
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  s = await viewerState(page);
  expect(s).toMatchObject({ count: `Page 2 of ${TOTAL}`, shown: ['page-2'] });
});

test('with reduced motion a turn is instant: no animation runs', async ({ page }) => {
  await page.goto(brochure());
  await page.getByRole('button', { name: 'Next page' }).click();
  const running = await page.evaluate(() => document.querySelectorAll('.gb-page.is-leaving, .gb-page.is-entering').length
    + [...document.querySelectorAll('.gb-page')].reduce((n, el) => n + el.getAnimations().length, 0));
  expect(running).toBe(0);
  expect((await viewerState(page)).shown).toEqual(['page-2']);
});

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('a turn animates the two pages with transforms and opacity, then shows only the new page', async ({ page }) => {
    await page.goto(brochure());
    // The click and the reading happen in one step inside the page, so a slow round trip cannot miss the animation.
    const during = await page.evaluate(() => {
      document.querySelector('[data-gb-next]').click();
      return [...document.querySelectorAll('.gb-page')].flatMap((el) => el.getAnimations().map((a) => ({
        id: el.id, props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))],
      })));
    });
    expect(during.map((a) => a.id).sort()).toEqual(['page-1', 'page-2']);
    for (const a of during) for (const prop of a.props) expect(['transform', 'opacity']).toContain(prop);
    await expect.poll(async () => (await viewerState(page)).shown).toEqual(['page-2']);
  });
});

for (const width of [320, 390]) {
  test(`no sideways scroll at ${width}px on a guide and a brochure (viewer and stacked)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const p of [BS, P('c-py')]) {
      await page.goto(`${p.url}guide/`);
      expect(await sideways(page), `${p.url}guide/`).toEqual({ page: 0, out: [] });
      await page.goto(brochure(p));
      for (let i = 0; i < brochurePages(p).length; i++) {
        expect(await sideways(page), `${brochure(p)} page ${i + 1}`).toEqual({ page: 0, out: [] });
        if (i < brochurePages(p).length - 1) await page.getByRole('button', { name: 'Next page' }).click();
      }
      await page.getByRole('button', { name: 'Show all pages' }).click();
      expect(await sideways(page), `${brochure(p)} stacked`).toEqual({ page: 0, out: [] });
    }
  });
}

/**
 * Every brochure page as laid out now: its A4 ratio, how far its content runs past the top of the page footer (the
 * credential line; on the cover, which has none, past the page body), and text smaller than FLOOR of the page font.
 */
const FLOOR = 0.68;
const brochureLayout = (page) => page.evaluate((FLOOR) => [...document.querySelectorAll('.gb-page')].map((pg) => {
  const r = pg.getBoundingClientRect();
  const body = pg.querySelector('.gb-body');
  const foot = pg.querySelector('.gb-foot');
  const limit = getComputedStyle(foot).display === 'none' ? body.getBoundingClientRect().bottom : foot.getBoundingClientRect().top;
  const bottom = Math.max(...[...body.querySelectorAll('*')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect().bottom));
  const base = parseFloat(getComputedStyle(pg).fontSize);
  const small = [...pg.querySelectorAll('*')]
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length && !el.closest('.sr-only'))
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) / base < FLOOR - 0.005)
    .map((el) => `"${el.textContent.trim().slice(0, 30)}" ${(parseFloat(getComputedStyle(el).fontSize) / base).toFixed(2)}em`);
  return { id: pg.id, ratio: r.height / r.width, overflow: Math.round(bottom - limit), small: small.slice(0, 3) };
}), FLOOR);

// The pages' own responsive layout follows their width only (a container query), so a window between 700 and 1000
// pixels (a tablet, or a desktop zoomed in) lays them out exactly as a wide one, and nothing slips behind the footer.
for (const width of [768, 820, 1000, 1280]) {
  test(`at ${width}px every brochure page keeps the A4 proportion and its content fits above the footer`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const p of PROGRAMS) {
      await page.goto(brochure(p));
      await page.getByRole('button', { name: 'Show all pages' }).click();
      for (const x of await brochureLayout(page)) {
        expect(Math.abs(x.ratio - 297 / 210), `${p.id} ${x.id} is A4`).toBeLessThan(0.01);
        expect(x.overflow, `${p.id} ${x.id} content fits`).toBeLessThanOrEqual(0);
        if (width === 1280) expect(x.small, `${p.id} ${x.id}: text below ${FLOOR} of the page font`).toEqual([]);
      }
    }
  });
}

test('turning a page shows the new page from its top, below the sticky bar; "Show all pages" keeps the reader on their page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(brochure());
  const where = () => page.evaluate(() => {
    const cur = document.querySelector('.gb-page.is-current') ?? document.querySelector('.gb-page:target');
    return { top: Math.round(cur.getBoundingClientRect().top), bar: Math.round(document.querySelector('.gb-bar').getBoundingClientRect().bottom) };
  });
  await page.getByRole('button', { name: 'Next page' }).click();
  // Read to the end of page 2, then turn with the sticky bar's Next.
  await page.evaluate(() => window.scrollBy(0, document.querySelector('#page-2').getBoundingClientRect().bottom - innerHeight + 40));
  expect((await where()).top).toBeLessThan(0);
  await page.getByRole('button', { name: 'Next page' }).click();
  let w = await where();
  expect(w.top, 'page 3 starts below the bar').toBeGreaterThanOrEqual(w.bar);
  expect(w.top - w.bar, 'and close to it').toBeLessThan(40);
  // The same with the arrow keys after scrolling down.
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.locator('[data-gb-viewer]').focus();
  await page.keyboard.press('ArrowRight');
  w = await where();
  expect(w.top).toBeGreaterThanOrEqual(w.bar);
  expect(w.top - w.bar).toBeLessThan(40);
  // "Show all pages" from page 4: page 4 is the one in view, just below the bar.
  await page.getByRole('button', { name: 'Show all pages' }).click();
  const top4 = await page.evaluate(() => Math.round(document.querySelector('#page-4').getBoundingClientRect().top));
  expect(top4).toBeGreaterThanOrEqual(w.bar);
  expect(top4).toBeLessThan(w.bar + 60);
});

test('on a phone, the pager under a long page turns it and brings the bar and the new page into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(brochure());
  await expect(page.getByRole('button', { name: /^Back to page/ })).toBeHidden();   // nothing before page 1
  await page.evaluate(() => window.scrollBy(0, document.querySelector('#page-1').getBoundingClientRect().bottom - innerHeight + 120));
  const on = page.getByRole('button', { name: 'Turn to page 2' });
  await expect(on).toBeInViewport();
  const h = (await on.boundingBox()).height;
  expect(h).toBeGreaterThanOrEqual(44);
  await on.click();
  await expect(page.locator('[data-gb-count]')).toHaveText(`Page 2 of ${TOTAL}`);
  await expect(page.locator('[data-gb-controls]')).toBeInViewport();
  const s = await page.evaluate(() => ({ bar: document.querySelector('.gb-bar').getBoundingClientRect().top, header: document.querySelector('header.top').getBoundingClientRect().bottom }));
  expect(s.bar, 'the bar shows below the header').toBeGreaterThanOrEqual(s.header);
  await page.getByRole('button', { name: 'Back to page 1' }).click();
  await expect(page.locator('[data-gb-count]')).toHaveText(`Page 1 of ${TOTAL}`);
  await page.getByRole('button', { name: 'Show all pages' }).click();
  await expect(page.locator('[data-gb-end]')).toBeHidden();
});

// The viewer bar and the print button appear when guide.js runs; their space is kept from the first paint, so the
// page does not jump. Web fonts are blocked here: their swap moves text on every page of the site, which is not what
// this test measures.
for (const width of [390, 1280]) {
  test(`at ${width}px the brochure does not shift as it loads (layout shift below 0.01)`, async ({ page }) => {
    await page.route(/\.(woff2?|ttf|otf)(\?|$)|fonts\.googleapis\.com|fonts\.gstatic\.com/, (route) => route.abort());
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const p of [BS, P('c-py')]) {
      await page.goto(brochure(p));
      await expect(page.locator('[data-gb-controls]')).toBeVisible();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await page.evaluate(() => window.__cls), `${p.id}: cumulative layout shift`).toBeLessThan(0.01);
    }
  });
}

// The project's rule is 44px for every link and button (WCAG's minimum is 24px), except links inside a sentence and
// the site-wide breadcrumbs.
for (const width of [390, 1280]) {
  test(`at ${width}px every link and button on a guide and a brochure is at least 44px high`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [`${BS.url}guide/`, `${P('c-py').url}guide/`, brochure(BS), brochure(P('c-py'))]) {
      await page.goto(path);
      if (path.endsWith('brochure/')) await page.getByRole('button', { name: 'Show all pages' }).click();
      const small = await page.evaluate(() => [...document.querySelectorAll('main a[href], main button')]
        .filter((el) => el.getClientRects().length && el.checkVisibility({ visibilityProperty: true }) && !el.closest('.crumbs, .sr-only'))
        .filter((el) => !(getComputedStyle(el).display === 'inline' && el.parentElement.textContent.trim().length > el.textContent.trim().length))
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => `${el.textContent.trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}px`));
      expect(small, path).toEqual([]);
    }
  });
}

test('without JavaScript every brochure page shows, stacked, with no viewer controls', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}${brochure()}`);
  await expect(page.locator('.gb-page:visible')).toHaveCount(TOTAL);
  await expect(page.locator('[data-gb-controls]')).toBeHidden();
  await expect(page.locator('[data-gb-print]')).toBeHidden();
  await expect(page.locator('[data-gb-end]')).toBeHidden();
  // Without scripts the space kept for them (see the layout-shift test) is not kept: they take none.
  expect(await page.locator('[data-gb-controls]').boundingBox()).toBeNull();
  expect(await page.locator('[data-gb-print]').boundingBox()).toBeNull();
  await context.close();
});

test('print: one brochure page per A4 sheet, every page shown, and the site chrome and controls hidden', async ({ page }) => {
  // The window has the width of the A4 sheet (794px), as when the browser lays out a page for printing.
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.goto(brochure(BS, '#page-4'));
  await page.emulateMedia({ media: 'print' });
  const looks = await page.evaluate(() => {
    const css = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const pages = [...document.querySelectorAll('.gb-page')].map((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, breakAfter: s.breakAfter, width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height), adjust: s.printColorAdjust, transform: s.transform };
    });
    return { pages, header: css('header.top').display, footer: css('.sitefoot').display, strip: css('.topstrip').display, bar: css('.gb-bar').display, tools: css('.gb-top').display };
  });
  expect(looks).toMatchObject({ header: 'none', footer: 'none', strip: 'none', bar: 'none', tools: 'none' });
  expect(looks.pages).toHaveLength(TOTAL);
  looks.pages.forEach((pg, i) => {
    expect(pg.display, `page ${i + 1}`).toBe('block');
    expect(pg.width).toBe(794);                 // 210 mm
    expect(pg.height).toBe(1123);               // 297 mm
    expect(pg.adjust).toBe('exact');
    expect(pg.transform).toBe('none');
    expect(pg.breakAfter).toBe(i === TOTAL - 1 ? 'auto' : 'page');
  });
  // Printed, every program's pages hold their content above the footer, with no text below the size floor.
  for (const p of PROGRAMS) {
    await page.goto(brochure(p));
    for (const x of await brochureLayout(page)) {
      expect(x.overflow, `print ${p.id} ${x.id} content fits`).toBeLessThanOrEqual(0);
      expect(x.small, `print ${p.id} ${x.id}: text below ${FLOOR} of the page font`).toEqual([]);
    }
  }
});
