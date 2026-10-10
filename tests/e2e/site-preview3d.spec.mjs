// The 3D preview of a program guide (web/assets/js/preview3d.js) in the browser: it loads only when asked for,
// shows the right program's cover and true facts, turns with keys, buttons and dragging, announces the side that
// faces the visitor, closes with Escape back to its button, never turns by itself with reduced motion, and fits a
// 320px phone. Behaviour tests run with reduced motion (instant turns); the motion tests switch it off.
import { test, expect } from './fixtures.mjs';
import { PROGRAMS, CREDENTIAL } from '../../web/data/programs.mjs';

const P = (id) => PROGRAMS.find((p) => p.id === id);

/** Console errors, page errors and failed requests for site files (Google Fonts is optional and is ignored). */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '')) errors.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.url().startsWith('http://127.0.0.1') && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  return errors;
}

/** The book's current turn, read from its transform: { rx, ry } in degrees. */
async function turn(page) {
  const t = await page.locator('[data-p3d-book]').evaluate((el) => el.style.transform);
  const m = /rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/.exec(t);
  expect(m, `book transform: ${t}`).not.toBeNull();
  return { rx: Number(m[1]), ry: Number(m[2]) };
}

// keyboard: press the button with Enter. With motion on, the page's scroll-linked motion can move a button between
// the test driver scrolling it into view and clicking it (see playwright.config.mjs), so motion tests use the key.
async function openFor(page, id, { keyboard = false } = {}) {
  await page.goto('/programs/');
  const button = page.locator(`#programs-catalog [data-program="${id}"]`).getByRole('button', { name: `3D preview of the ${P(id).name} program guide` });
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
  const dialog = page.getByRole('dialog', { name: `3D preview: ${P(id).name}` });
  await expect(dialog).toBeVisible();
  return { button, dialog };
}

const side = (dialog) => dialog.getByRole('status');

test('nothing loads before the button is pressed; then the dialog shows that program’s cover and true facts', async ({ page }) => {
  const errors = watchErrors(page);
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto('/programs/');
  await page.waitForLoadState('load');
  expect(requested.filter((u) => /preview3d/.test(u))).toEqual([]);
  await expect(page.locator('dialog.p3d')).toHaveCount(0);

  for (const id of ['c-genai', 'bs-ds']) {
    const p = P(id);
    const slug = p.url.split('/').filter(Boolean).at(-1);
    const { button, dialog } = await openFor(page, id);
    expect(requested.some((u) => u.endsWith('/js/preview3d.js'))).toBe(true);
    expect(requested.some((u) => u.endsWith('/css/preview3d.css'))).toBe(true);
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(`3D preview: ${p.name}`);
    await expect(dialog.locator('#p3d-hint')).toHaveText('A 3D model of the program guide’s design, with facts from the program page. Drag or use the arrow keys to turn it.');
    // Focus starts on the model, so the arrow keys work at once.
    await expect(dialog.getByRole('group', { name: `${p.name} program guide` })).toBeFocused();

    const cover = dialog.locator('.p3d-front img');
    await expect(cover).toHaveAttribute('src', `/covers/${slug}-brochure.svg`);
    await expect(cover).toHaveAttribute('alt', `Cover design of the ${p.name} program guide`);
    await expect.poll(() => cover.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    await expect(dialog.locator('.p3d-spine-name')).toHaveText(p.short);

    const back = dialog.locator('.p3d-back');
    await expect(back.locator('.p3d-back-name')).toHaveText(p.name);
    const facts = await back.locator('.p3d-facts div').evaluateAll((rows) => rows.map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]));
    expect(facts).toEqual([
      ['Level', p.levelLabel],
      ['Duration', p.duration],
      ['Weekly hours', `${p.weeklyHours} hrs/week`],
      ['Tuition', `$${p.tuition.perTerm.toLocaleString('en-US')} per term`],
      ['Terms', `${p.termCount} ${p.termCount === 1 ? 'term' : 'terms'}`],
    ]);
    expect(p.tuition.currency).toBe('USD');
    await expect(back.locator('.p3d-cred')).toHaveText(`${CREDENTIAL.short} · not an accredited degree`);
    await expect(back.getByRole('link', { name: `Program page: ${p.name}` })).toHaveAttribute('href', p.url);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('arrow keys and the buttons turn the book, and the live region names the side that faces the visitor', async ({ page }) => {
  const errors = watchErrors(page);
  const { dialog } = await openFor(page, 'ms-aml');
  const status = side(dialog);
  await expect(status).toHaveAttribute('aria-live', 'polite');
  expect(await turn(page)).toEqual({ rx: -13, ry: -30 });
  await expect(status).toHaveText('Facing you: Front cover');

  await page.keyboard.press('ArrowRight');
  expect(await turn(page)).toEqual({ rx: -13, ry: -15 });
  await page.keyboard.press('ArrowUp');
  expect(await turn(page)).toEqual({ rx: -5, ry: -15 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  expect(await turn(page)).toEqual({ rx: -13, ry: -30 });

  // "Turn right" steps to whole 45-degree views: front, three-quarter, spine.
  const right = dialog.getByRole('button', { name: 'Turn right' });
  await right.click();
  expect((await turn(page)).ry).toBe(0);
  await right.click();
  await right.click();
  expect((await turn(page)).ry).toBe(90);
  await expect(status).toHaveText('Facing you: Spine');

  await dialog.getByRole('button', { name: 'Show back' }).click();
  expect(await turn(page)).toEqual({ rx: 0, ry: 180 });
  await expect(status).toHaveText('Facing you: Back cover');
  await expect(dialog.locator('.p3d-back-link')).toHaveAttribute('tabindex', '0');

  await dialog.getByRole('button', { name: 'Show front' }).click();
  expect(await turn(page)).toEqual({ rx: 0, ry: 0 });
  await expect(status).toHaveText('Facing you: Front cover');
  // The back-cover link is no Tab stop while the back faces away.
  await expect(dialog.locator('.p3d-back-link')).toHaveAttribute('tabindex', '-1');

  const left = dialog.getByRole('button', { name: 'Turn left' });
  await left.click();
  await left.click();
  expect((await turn(page)).ry).toBe(-90);
  await expect(status).toHaveText('Facing you: Page edges');

  // Arrow keys also work while one of the buttons has focus.
  await expect(left).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  expect((await turn(page)).ry).toBe(-105);

  await dialog.getByRole('button', { name: 'Reset view' }).click();
  expect(await turn(page)).toEqual({ rx: -13, ry: -30 });
  await expect(status).toHaveText('Facing you: Front cover');
  expect(errors).toEqual([]);
});

test('dragging with a mouse, or with a touch pointer, turns the book on both axes', async ({ page }) => {
  const errors = watchErrors(page);
  const { dialog } = await openFor(page, 'bs-aiml');
  const stage = dialog.locator('[data-p3d-stage]');
  const box = await stage.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  const before = await turn(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 40, { steps: 8 });
  await page.mouse.up();
  const after = await turn(page);
  expect(after.ry - before.ry).toBeGreaterThan(35);   // 100 px right turns the spine forward
  expect(after.rx).toBeLessThan(before.rx);            // 40 px down tips the top toward the visitor
  // A drag is not a click: the dialog is still open.
  await expect(dialog).toBeVisible();

  // A touch drag (pointer events, as a phone sends them).
  const t0 = await turn(page);
  const ev = (type, x, y) => stage.dispatchEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true });
  await ev('pointerdown', cx, cy);
  for (let i = 1; i <= 6; i++) await ev('pointermove', cx - i * 15, cy);
  await ev('pointerup', cx - 90, cy);
  expect((await turn(page)).ry).toBeLessThan(t0.ry - 30);
  expect(errors).toEqual([]);
});

test('focus never stays on the back-cover link once the back turns away, and its focus ring is drawn inside the band', async ({ page }) => {
  const errors = watchErrors(page);
  const { dialog } = await openFor(page, 'bs-ds');
  const stage = dialog.locator('[data-p3d-stage]');
  const link = dialog.getByRole('link', { name: `Program page: ${P('bs-ds').name}` });
  await page.keyboard.press('End');
  await expect(side(dialog)).toHaveText('Facing you: Back cover');
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();

  // The ring sits inside the gold band, in its dark ink, so the back cover's clipping cannot cut it off.
  const ring = await link.evaluate((a) => {
    const s = getComputedStyle(a);
    const r = a.getBoundingClientRect(), back = a.closest('.p3d-back').getBoundingClientRect();
    const outset = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
    return { visible: a.matches(':focus-visible'), style: s.outlineStyle, color: s.outlineColor, outset,
      inside: r.left - outset >= back.left - 0.5 && r.right + outset <= back.right + 0.5 && r.bottom + outset <= back.bottom + 0.5 };
  });
  expect(ring).toEqual({ visible: true, style: 'solid', color: 'rgb(26, 18, 3)', outset: -3, inside: true });

  // Turning the book (keys from the link reach the model) moves focus to the model as the back turns away.
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  await expect(side(dialog)).toHaveText('Facing you: Front cover');
  await expect(stage).toBeFocused();
  await expect(link).toHaveAttribute('tabindex', '-1');
  // Enter now follows nothing.
  const url = page.url();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
});

/** Back-cover measurements: font sizes, whether the content fits, and the book's size. */
const backSizes = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog.p3d');
  const px = (s) => parseFloat(getComputedStyle(d.querySelector(s)).fontSize);
  const inner = d.querySelector('.p3d-back-in'), back = d.querySelector('.p3d-back').getBoundingClientRect();
  const link = d.querySelector('.p3d-back-link').getBoundingClientRect();
  const visibleFacts = [...d.querySelectorAll('.p3d-facts > div')].filter((f) => f.getBoundingClientRect().width > 2).map((f) => f.querySelector('dt').textContent);
  return {
    cred: px('.p3d-cred'), dd: px('.p3d-facts dd'), dt: px('.p3d-facts dt'), name: px('.p3d-back-name'),
    overflow: inner.scrollHeight - inner.clientHeight, linkInside: link.bottom <= back.bottom + 0.5 && link.top >= back.top - 0.5, linkHeight: link.height,
    bookWidth: d.querySelector('.p3d-scene').getBoundingClientRect().width, visibleFacts, factsInDom: d.querySelectorAll('.p3d-facts > div').length,
  };
});

for (const [w, h, minBook] of [[1366, 860, 300], [1280, 720, 260], [390, 844, 230], [320, 640, 190]]) {
  test(`at ${w}x${h} the back-cover text is readable and fits, and the book uses the room it has`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: h });
    const { dialog } = await openFor(page, 'bs-aiml');
    // The front is laid out at twice the book's size and drawn at half, so the cover art stays sharp when turned.
    await dialog.getByRole('button', { name: 'Show front' }).click();
    const front = await page.evaluate(() => {
      const scene = document.querySelector('.p3d-scene'), f = document.querySelector('.p3d-front');
      return { layout: f.offsetWidth / scene.offsetWidth, drawn: f.getBoundingClientRect().width / scene.getBoundingClientRect().width };
    });
    expect(front.layout).toBeCloseTo(2, 2);
    expect(front.drawn).toBeGreaterThan(0.95);
    expect(front.drawn).toBeLessThan(1.1);

    await dialog.getByRole('button', { name: 'Show back' }).click();
    const s = await backSizes(page);
    expect(s.bookWidth).toBeGreaterThanOrEqual(minBook);
    expect(s.cred).toBeGreaterThanOrEqual(11);   // the credential line is never the smallest text
    expect(s.dd).toBeGreaterThanOrEqual(11);
    expect(s.dt).toBeGreaterThanOrEqual(10);
    expect(s.overflow).toBeLessThanOrEqual(0);
    expect(s.linkInside).toBe(true);
    expect(s.linkHeight).toBeGreaterThanOrEqual(44);
    expect(s.factsInDom).toBe(5);                // every fact stays in the page for screen readers
    expect(s.visibleFacts.length).toBeGreaterThanOrEqual(w >= 390 ? 5 : 3);
    await expect(dialog.getByRole('link', { name: `Program page: ${P('bs-aiml').name}` })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const [w, h] of [[844, 390], [640, 400], [568, 320]]) {
  test(`on a short ${w}x${h} screen (a phone held sideways) the model, status and every button fit without scrolling`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: h });
    const { dialog } = await openFor(page, 'bs-aiml');
    await dialog.getByRole('button', { name: 'Show back' }).click();
    const m = await page.evaluate(() => {
      const d = document.querySelector('dialog.p3d');
      const r = (el) => el.getBoundingClientRect();
      const box = r(d), stage = r(d.querySelector('[data-p3d-stage]')), book = r(d.querySelector('.p3d-scene'));
      const inView = (e) => { const b = r(e); return b.top >= box.top && b.bottom <= box.bottom && b.left >= box.left && b.right <= box.right; };
      return {
        scrolls: d.scrollHeight - d.clientHeight, fitsScreen: box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
        controls: [...d.querySelectorAll('button, [role="status"]')].every(inView),
        book: book.top >= stage.top && book.bottom <= stage.bottom && book.left >= stage.left && book.right <= stage.right,
        backFits: d.querySelector('.p3d-back-in').scrollHeight <= d.querySelector('.p3d-back-in').clientHeight,
        page: document.documentElement.scrollWidth,
      };
    });
    expect(m).toEqual({ scrolls: 0, fitsScreen: true, controls: true, book: true, backFits: true, page: w });
    expect(errors).toEqual([]);
  });
}

test('in forced-colours (high contrast) mode the book keeps its own colours, so its spine and edges stay', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ forcedColors: 'active' });
  const { dialog } = await openFor(page, 'ms-ds');
  const looks = await dialog.locator('.p3d-spine').evaluate((el) => ({ adjust: getComputedStyle(el).forcedColorAdjust, image: getComputedStyle(el).backgroundImage }));
  expect(looks.adjust).toBe('none');
  expect(looks.image).toContain('linear-gradient');
  expect(errors).toEqual([]);
});

test('if the preview cannot load, the button says so beside it instead of doing nothing', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('**/js/preview3d.js', (route) => route.abort('failed'));
  await page.goto('/programs/');
  const card = page.locator('#programs-catalog [data-program="c-py"]');
  await card.getByRole('button', { name: `3D preview of the ${P('c-py').name} program guide` }).click();
  await expect(card.getByRole('status')).toHaveText('The 3D preview could not load. The brochure and the program page still work.');
  await expect(page.locator('dialog.p3d')).toHaveCount(0);
  expect(pageErrors).toEqual([]);   // no unhandled promise rejection
});

test('Escape and the close button close it and return focus to the button that opened it', async ({ page }) => {
  const errors = watchErrors(page);
  const { button, dialog } = await openFor(page, 'c-mlops');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.locator('html')).not.toHaveClass(/p3d-lock/);

  await button.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close 3D preview' }).click();
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  expect(errors).toEqual([]);
});

test('with reduced motion the book never turns by itself', async ({ page }) => {
  const errors = watchErrors(page);
  await openFor(page, 'ms-ds');
  const a = await turn(page);
  await page.waitForTimeout(1200);
  expect(await turn(page)).toEqual(a);
  expect(errors).toEqual([]);
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a slow automatic turn plays until the visitor interacts, and a flick keeps turning a little', async ({ page }) => {
    const errors = watchErrors(page);
    const { dialog } = await openFor(page, 'c-py', { keyboard: true });
    const status = side(dialog);
    // While it turns by itself the live region is quiet, so it does not talk over the page.
    await expect(status).toHaveAttribute('aria-live', 'off');
    const a = await turn(page);
    await expect.poll(async () => (await turn(page)).ry, { timeout: 5000 }).toBeGreaterThan(a.ry + 3);

    // Any key stops it, and the live region speaks again.
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await page.waitForTimeout(500);   // the key's own short turn ends
    const settled = await turn(page);
    await page.waitForTimeout(700);
    expect(await turn(page)).toEqual(settled);

    // A quick flick carries on with inertia after release, then comes to rest. The pointer events are sent from the
    // page, 16 ms apart as a real flick is, because the test driver's own mouse can pause before the release (and a
    // drag that pauses before release rightly does not coast).
    const released = await dialog.locator('[data-p3d-stage]').evaluate(async (stage) => {
      const r = stage.getBoundingClientRect();
      const at = (type, x) => stage.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: r.top + r.height / 2, bubbles: true }));
      const x0 = r.left + r.width / 2 - 60;
      at('pointerdown', x0);
      for (let i = 1; i <= 6; i++) { await new Promise((ok) => setTimeout(ok, 16)); at('pointermove', x0 + i * 20); }
      at('pointerup', x0 + 120);
      return Number(/rotateY\((-?[\d.]+)deg\)/.exec(stage.querySelector('[data-p3d-book]').style.transform)[1]);
    });
    await expect.poll(async () => (await turn(page)).ry, { timeout: 2000 }).toBeGreaterThan(released + 10);
    // ...and comes to rest.
    await expect.poll(async () => { const a = (await turn(page)).ry; await page.waitForTimeout(250); return (await turn(page)).ry - a; }, { timeout: 4000 }).toBe(0);
    expect(errors).toEqual([]);
  });

  test('left alone, the automatic turn stops by itself after a few seconds (no endless motion)', async ({ page }) => {
    const errors = watchErrors(page);
    const { dialog } = await openFor(page, 'c-genai', { keyboard: true });
    const status = side(dialog);
    await expect(status).toHaveAttribute('aria-live', 'off');
    const a = await turn(page);
    await expect.poll(async () => (await turn(page)).ry, { timeout: 5000 }).toBeGreaterThan(a.ry + 3);
    // It stops within about five seconds of opening and the live region speaks again; nobody pressed anything.
    await expect(status).toHaveAttribute('aria-live', 'polite', { timeout: 8000 });
    const stopped = await turn(page);
    await page.waitForTimeout(600);
    expect(await turn(page)).toEqual(stopped);
    expect(stopped.ry - a.ry).toBeLessThan(90);    // a gentle swing, not a spin
    await expect(status).toHaveText('Facing you: Front cover');
    expect(errors).toEqual([]);
  });

  test('pressing Tab stops the automatic turn, so nothing moves while the visitor moves through the dialog', async ({ page }) => {
    const errors = watchErrors(page);
    const { dialog } = await openFor(page, 'c-mlops', { keyboard: true });
    const status = side(dialog);
    await expect(status).toHaveAttribute('aria-live', 'off');
    await page.keyboard.press('Tab');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    const settled = await turn(page);
    await page.waitForTimeout(600);
    expect(await turn(page)).toEqual(settled);
    expect(errors).toEqual([]);
  });
});

test('on a 320px phone the model fits, nothing scrolls sideways and the buttons wrap', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 640 });
  const { dialog } = await openFor(page, 'bs-ds');
  const sizes = await page.evaluate(() => {
    const d = document.querySelector('dialog.p3d');
    const stage = d.querySelector('[data-p3d-stage]').getBoundingClientRect();
    const book = d.querySelector('.p3d-scene').getBoundingClientRect();
    const box = d.getBoundingClientRect();
    return {
      page: document.documentElement.scrollWidth, dialogScroll: d.scrollWidth, dialogWidth: d.clientWidth,
      dialog: [box.left, box.right], stage: [stage.left, stage.right], book: [book.left, book.right, book.top, book.bottom], stageY: [stage.top, stage.bottom],
      buttons: [...d.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, height: r.height }; }),
    };
  });
  expect(sizes.page).toBeLessThanOrEqual(320);
  expect(sizes.dialogScroll).toBeLessThanOrEqual(sizes.dialogWidth);
  expect(sizes.dialog[0]).toBeGreaterThanOrEqual(0);
  expect(sizes.dialog[1]).toBeLessThanOrEqual(320);
  expect(sizes.book[0]).toBeGreaterThanOrEqual(sizes.stage[0]);
  expect(sizes.book[1]).toBeLessThanOrEqual(sizes.stage[1]);
  expect(sizes.book[2]).toBeGreaterThanOrEqual(sizes.stageY[0]);
  expect(sizes.book[3]).toBeLessThanOrEqual(sizes.stageY[1]);
  for (const b of sizes.buttons) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.left).toBeGreaterThanOrEqual(sizes.dialog[0]);
    expect(b.right).toBeLessThanOrEqual(sizes.dialog[1]);
  }
  // The five turn buttons wrap onto more than one row.
  const rows = new Set(sizes.buttons.slice(1).map((b) => Math.round(b.top)));
  expect(rows.size).toBeGreaterThan(1);
  await dialog.getByRole('button', { name: 'Show back' }).click();
  await expect(dialog.getByRole('link', { name: `Program page: ${P('bs-ds').name}` })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the card controls are at least 44px tall and the 3D button sits next to the "Brochure" link', async ({ page }) => {
  await page.goto('/programs/');
  for (const card of await page.locator('#programs-catalog [data-card]').all()) {
    const id = await card.getAttribute('data-program');
    const brochure = card.getByRole('link', { name: `${P(id).name} brochure` });
    const preview = card.getByRole('button', { name: `3D preview of the ${P(id).name} program guide` });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveText('3D preview');
    const [a, b] = [await brochure.boundingBox(), await preview.boundingBox()];
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(a.height).toBeGreaterThanOrEqual(44);
    // Same row as "Brochure", or wrapped just below it on a narrow card.
    await expect(card.locator('.ccard-brochure [data-brochure-link] + [data-preview3d-trigger]')).toHaveCount(1);
    expect(b.y).toBeGreaterThanOrEqual(a.y - 1);
  }
});
