// The showcase parts of the website in the browser: the program catalog (topic tabs, "Show more" with focus, the
// whole card as a link, a saved match), the certificates section, and the footer accordions on phones.
import { test, expect } from './fixtures.mjs';
import { PROGRAMS } from '../../web/data/programs.mjs';

const P = (id) => PROGRAMS.find((p) => p.id === id);
const withTopic = (t) => PROGRAMS.filter((p) => p.topics.includes(t));

/** Console errors and page errors on this site (Google Fonts is optional and is ignored). */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '')) errors.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.url().includes('/covers/') && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  return errors;
}

const visibleIds = (cat) => cat.locator('[data-card]:visible').evaluateAll((els) => els.map((e) => e.dataset.program));

test('home catalog: three cards, then "Show more" reveals the rest and moves focus to the first new card', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const cat = page.locator('#home-catalog');
  await expect(cat.locator('[data-card]')).toHaveCount(PROGRAMS.length);
  await expect(cat.locator('[data-card]:visible')).toHaveCount(3);
  const more = cat.getByRole('button', { name: `Show ${PROGRAMS.length - 3} more programs` });
  await expect(more).toBeVisible();
  // Every visible cover loads.
  for (const img of await cat.locator('[data-card]:visible img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  }

  await more.click();
  await expect(cat.locator('[data-card]:visible')).toHaveCount(PROGRAMS.length);
  await expect(more).toBeHidden();
  const fourth = PROGRAMS[3];
  await expect(page.locator(':focus')).toHaveAttribute('href', fourth.url);
  await expect(page.locator(':focus')).toHaveText(fourth.name);
  expect(errors).toEqual([]);
});

test('topic tabs filter the cards, with aria-pressed, by mouse and by keyboard', async ({ page }) => {
  await page.goto('/');
  const cat = page.locator('#home-catalog');
  const tabs = cat.getByRole('group', { name: 'Filter programs by topic' });
  await expect(tabs.getByRole('button')).toHaveCount(5);
  await expect(tabs.getByRole('button', { name: 'All programs' })).toHaveAttribute('aria-pressed', 'true');

  await tabs.getByRole('button', { name: 'MLOps' }).click();
  await expect(tabs.getByRole('button', { name: 'MLOps' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tabs.getByRole('button', { name: 'All programs' })).toHaveAttribute('aria-pressed', 'false');
  expect((await visibleIds(cat)).sort()).toEqual(withTopic('MLOps').map((p) => p.id).sort());
  await expect(cat.locator('[data-catalog-status]')).toHaveText(`${withTopic('MLOps').length} programs in MLOps.`);

  // Keyboard: focus a tab and press Space, then Enter on another.
  await tabs.getByRole('button', { name: 'Generative AI' }).focus();
  await page.keyboard.press('Space');
  await expect(tabs.getByRole('button', { name: 'Generative AI' })).toHaveAttribute('aria-pressed', 'true');
  expect((await visibleIds(cat)).sort()).toEqual(withTopic('Generative AI').map((p) => p.id).sort());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator(':focus')).toHaveText(/All programs/);
  await page.keyboard.press('Enter');
  await expect(cat.locator('[data-card]:visible')).toHaveCount(3);
  await expect(cat.locator('[data-catalog-more]')).toBeVisible();

  // A topic with more programs than the limit offers "Show more" for its own cards.
  await tabs.getByRole('button', { name: 'Data Science' }).click();
  const ds = withTopic('Data Science');
  await expect(cat.locator('[data-card]:visible')).toHaveCount(Math.min(3, ds.length));
  await expect(cat.locator('[data-catalog-more]')).toBeVisible({ visible: ds.length > 3 });
});

test('the whole card opens its program, and the title link is reachable by keyboard', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#home-catalog [data-card]').first();
  // The title link's overlay covers the card, so a click on the picture lands on the link.
  await card.locator('.ccard-cover').click({ force: true });
  await expect(page).toHaveURL(new RegExp(`${PROGRAMS[0].url}$`));
  await page.goBack();
  const link = page.locator('#home-catalog [data-card]').first().getByRole('link');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${PROGRAMS[0].url}$`));
});

test('a saved match is moved to the front of the catalog and shown with its badge', async ({ page }) => {
  const m = P('c-mlops');
  await page.addInitScript(([id, name]) => {
    localStorage.setItem('nuvora.plan', JSON.stringify({ v: 1, match: id, matchName: name, savedAt: Date.now() }));
  }, [m.id, m.name]);
  await page.goto('/');
  const cat = page.locator('#home-catalog');
  await expect(cat.locator('[data-card]:visible')).toHaveCount(3);
  await expect(cat.locator('[data-card]:visible').first()).toHaveAttribute('data-program', m.id);
  await expect(cat.locator(`[data-program="${m.id}"]`).getByText('Your match')).toBeVisible();
});

test('without JavaScript every card shows and the tabs and button stay hidden', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  const cat = page.locator('#home-catalog');
  await expect(cat.locator('[data-card]:visible')).toHaveCount(PROGRAMS.length);
  await expect(cat.locator('[data-catalog-tabs]')).toBeHidden();
  await expect(cat.locator('[data-catalog-more]')).toBeHidden();
  // Footer columns are open without JavaScript, on a phone too.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('footer.sitefoot').getByRole('link', { name: 'Privacy' })).toBeVisible();
  await ctx.close();
});

test('certificates section: three sample cards, labelled, with the disclaimer', async ({ page }) => {
  await page.goto('/');
  const sec = page.locator('#certificates');
  await expect(sec.getByRole('heading', { level: 2 })).toHaveText(/Turn your learning into\s*proof/);
  await expect(sec.locator('.certcard')).toHaveCount(3);
  await expect(sec.getByRole('img', { name: /Sample design of the Nuvora certificate of completion/ })).toBeVisible();
  await expect(sec.getByText('Sample design', { exact: true })).toBeVisible();
  await expect(sec.getByText(/Nuvora isn’t affiliated with these companies/)).toBeVisible();
  await expect(sec.locator('img')).toHaveCount(0);
  await page.goto(P('ms-aml').url);
  const cred = page.locator('#credential');
  await expect(cred.locator('.certcard')).toHaveCount(1);
  await expect(cred.getByRole('link', { name: /Official page/ }).first()).toBeVisible();
});

const FOOT_TITLES = ['Programs', 'Topics', 'Careers', 'Resources', 'Nuvora', 'Legal'];

test('footer on a phone: each heading holds a button that opens and closes its list, by keyboard too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  const foot = page.locator('footer.sitefoot');
  const toggles = foot.getByRole('heading', { level: 2 }).getByRole('button');
  await expect(toggles).toHaveCount(6);
  for (const [i, b] of (await toggles.all()).entries()) {
    await expect(b).toHaveAccessibleName(FOOT_TITLES[i]);
    await expect(b).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#${await b.getAttribute('aria-controls')}`)).toBeHidden();
  }
  await expect(foot.getByRole('link', { name: 'Privacy' })).toBeHidden();

  const legal = foot.getByRole('button', { name: 'Legal' });
  await legal.scrollIntoViewIfNeeded();
  expect((await legal.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await legal.focus();
  await page.keyboard.press('Enter');
  await expect(legal).toHaveAttribute('aria-expanded', 'true');
  await expect(foot.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(foot.getByRole('link', { name: 'Accessibility' })).toHaveAttribute('href', '/legal/accessibility/');
  await page.keyboard.press('Space');
  await expect(legal).toHaveAttribute('aria-expanded', 'false');
  await expect(foot.getByRole('link', { name: 'Privacy' })).toBeHidden();
  await foot.getByRole('button', { name: 'Programs' }).click();
  for (const p of PROGRAMS) await expect(foot.getByRole('link', { name: p.short, exact: true })).toBeVisible();
});

test('footer on a wide screen: every list is shown and the headings are plain headings, not controls', async ({ page }) => {
  await page.goto('/');
  const foot = page.locator('footer.sitefoot');
  await expect(foot.getByRole('heading', { level: 2 })).toHaveText(FOOT_TITLES);
  await expect(foot.locator('button, summary, details, [aria-expanded]')).toHaveCount(0);
  for (const name of ['Privacy', 'Media credits', 'Compare programs', 'All career paths']) await expect(foot.getByRole('link', { name })).toBeVisible();
  // Narrowing the window to phone width turns the headings into buttons, and widening it turns them back.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(foot.getByRole('button', { name: 'Legal' })).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 1366, height: 860 });
  await expect(foot.locator('button')).toHaveCount(0);
  await expect(foot.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(foot.locator('.sitefoot-social')).toHaveCount(0);   // no social accounts are configured yet
});

test('no horizontal scroll at 320px on the pages with the catalog, certificates and footer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ['/', '/programs/', P('ms-aml').url, P('c-py').url]) {
    await page.goto(path);
    await page.waitForLoadState('load');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${path} scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
    // Primary controls in the showcase parts are at least 44px tall.
    for (const el of await page.locator('.ccat-tabs button:visible, .ccat-more:visible').all()) {
      expect((await el.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  }
});
