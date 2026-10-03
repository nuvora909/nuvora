// The public website in the browser: the home page, Find my program, the saved plan, the career ladder, the
// advisor, old links, clean URLs, live dates and local class times, and the seat request form.
import { test, expect } from '@playwright/test';
import { reset, one } from './helpers.mjs';
import { QUESTIONS, BACHELOR_Q } from '../../web/assets/js/match.mjs';
import { nextStarts, todayInKolkata, weeklyTimeIn, termDates, fmtDay, isoDay, fromIso } from '../../web/assets/js/dates.mjs';
import { PROGRAMS, TUITION, money } from '../../web/data/programs.mjs';

const P = (id) => PROGRAMS.find((p) => p.id === id);
const DAY = 86400000;

/** Console errors, page errors and failed or broken requests to this site (third-party fonts are optional). */
function watchSite(page, baseURL) {
  const problems = [];
  const own = (url) => url.startsWith(baseURL);
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && own(m.location().url || baseURL)) problems.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    // Media downloads are cancelled by the browser when a clip is swapped or paused; that is not a failure.
    if (own(r.url()) && !(r.resourceType() === 'media' && /ERR_ABORTED/.test(r.failure()?.errorText ?? ''))) problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => { if (own(r.url()) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return problems;
}

/** Answers the finder's questions in order by clicking the option labels, waiting for each next question. */
async function answer(finder, labels) {
  for (const text of labels) {
    const option = finder.locator('label.f-opt').filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
    await expect(option).toBeVisible();
    await option.click();
    await expect(option).toBeHidden();   // the next question (or the result) replaces it
  }
}
const label = (qid, value) => [...QUESTIONS, BACHELOR_Q].find((q) => q.id === qid).options.find(([v]) => v === value)[1];
const TECH_AI = ['role:tech', 'goal:ai', 'hours:10+', 'coding:regular'].map((s) => label(...s.split(':')));

test('the home page loads cleanly', async ({ page, baseURL }) => {
  const problems = watchSite(page, baseURL);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText('career');
  await expect(page.locator('.pcard')).toHaveCount(PROGRAMS.length);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  expect(problems).toEqual([]);
});

test('the header’s Find my program button opens the finder page', async ({ page }) => {
  await page.goto('/');
  await page.locator('header.top').getByRole('link', { name: 'Find my program' }).click();
  await expect(page).toHaveURL(/\/find-your-program\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('form#finder legend')).toHaveText(QUESTIONS[0].q);
});

test('the hero finder gives an explained match and leads to the learning path with dates', async ({ page }) => {
  await page.goto('/');
  const finder = page.locator('form#hero-finder');
  await answer(finder, TECH_AI);
  const result = finder.locator('.f-result');
  await expect(result).toBeVisible();
  await expect(result.getByRole('heading', { name: P('c-genai').name })).toBeVisible();
  const scoreText = await result.locator('.ring').textContent();
  const score = Number(/(\d+)%/.exec(scoreText)[1]);
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThanOrEqual(100);
  const why = result.getByRole('list', { name: 'Why this program' });
  expect(await why.locator('li').count()).toBeGreaterThanOrEqual(1);
  const breakdown = result.locator('details.f-breakdown');
  await expect(breakdown.locator('summary')).toHaveText(`How this ${score}% is calculated`);
  await breakdown.locator('summary').click();
  const points = await breakdown.locator('td').allTextContents();
  expect(points).toHaveLength(4);
  expect(points.reduce((n, t) => n + Number(t.split('/')[0]), 0)).toBe(score);

  await result.getByRole('link', { name: /See my learning path/ }).click();
  await expect(page).toHaveURL(/\/find-your-program\/#result$/);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result')).toContainText(`${score}%`);
  const path = page.locator('section#path');
  await expect(path).toBeVisible();
  await expect(path.getByRole('heading', { level: 2 })).toHaveText(P('c-genai').name);
  const terms = path.locator('details.term');
  await expect(terms).toHaveCount(P('c-genai').termCount);
  const start = nextStarts(1, todayInKolkata())[0].start;
  const [first] = termDates(start, 1);
  await expect(terms.first().locator('time').first()).toHaveAttribute('datetime', isoDay(first.start));
  await expect(terms.first()).toContainText(fmtDay(first.end));
  await expect(path).toContainText(money(P('c-genai').tuition.perTerm));
});

test('a visitor without a bachelor’s degree is asked, and then never offered a master’s-level program', async ({ page }) => {
  await page.goto('/find-your-program/');
  const finder = page.locator('form#finder');
  await answer(finder, [label('role', 'manager'), label('goal', 'promoted'), label('hours', '10+'), label('coding', 'regular')]);
  await expect(finder.locator('legend')).toHaveText(BACHELOR_Q.q);
  await answer(finder, [label('bachelor', 'no')]);
  const result = finder.locator('.f-result');
  await expect(result).toBeVisible();
  await expect(result).not.toContainText('M.S.');
  await expect(result).not.toContainText('Master');
  await expect(page.locator('section#path')).not.toContainText('M.S.');

  // With a degree, the same answers lead to the master’s-level program.
  await finder.getByRole('button', { name: 'Start over' }).click();
  await answer(finder, [label('role', 'manager'), label('goal', 'promoted'), label('hours', '10+'), label('coding', 'regular'), label('bachelor', 'yes')]);
  await expect(finder.locator('.f-result h3')).toHaveText(P('ms-ds').name);
});

test('a saved plan is remembered on this device and can be forgotten', async ({ page }) => {
  await page.goto('/find-your-program/');
  await page.getByLabel(/Save my plan on this device/).check();
  await answer(page.locator('form#finder'), TECH_AI);
  await expect(page.locator('form#finder .f-result')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvora.plan')));
  expect(saved).toMatchObject({ v: 1, match: 'c-genai', matchName: P('c-genai').name });

  await page.goto('/');
  await page.reload();
  await expect(page.locator('[data-strip]')).toContainText('Welcome back');
  await expect(page.locator('[data-strip]')).toContainText(P('c-genai').name);
  const card = page.locator('.pcard[data-program="c-genai"]');
  await expect(card).toHaveClass(/is-match/);
  await expect(card.getByText('Your match')).toBeVisible();
  await expect(page.locator('.pcard.is-match')).toHaveCount(1);

  await page.goto('/find-your-program/');
  await page.getByRole('button', { name: 'Forget my plan' }).click();
  expect(await page.evaluate(() => localStorage.getItem('nuvora.plan'))).toBeNull();
  await page.goto('/');
  await expect(page.locator('[data-strip]')).not.toContainText('Welcome back');
  await expect(page.locator('.pcard.is-match')).toHaveCount(0);
});

test('the career ladder: tabs switch by click and arrow keys, and roles expand', async ({ page }) => {
  await page.goto('/');
  const ladder = page.locator('[data-ladder]');
  const tabs = ladder.getByRole('tab');
  const n = await tabs.count();
  expect(n).toBeGreaterThanOrEqual(2);
  const panelOf = async (tab) => ladder.locator(`#${await tab.getAttribute('aria-controls')}`);

  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(await panelOf(tabs.nth(1))).toBeVisible();
  await expect(await panelOf(tabs.nth(0))).toBeHidden();

  await page.keyboard.press('ArrowRight');
  const next = tabs.nth(2 % n);
  await expect(next).toHaveAttribute('aria-selected', 'true');
  await expect(next).toBeFocused();
  await expect(await panelOf(next)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(0).click();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(n - 1)).toHaveAttribute('aria-selected', 'true');   // wraps around

  const panel = await panelOf(tabs.nth(n - 1));
  const steps = panel.locator('[data-step]');
  const detailOf = async (step) => panel.locator(`#${await step.getAttribute('aria-controls')}`);
  await expect(steps.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await steps.nth(1).click();
  await expect(steps.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(steps.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(await detailOf(steps.nth(1))).toBeVisible();
  await expect(await detailOf(steps.nth(0))).toBeHidden();
  await expect(await detailOf(steps.nth(1))).toContainText('Programs that teach these skills');
});

test('the advisor answers from the catalog, and Escape closes it and returns focus', async ({ page, baseURL }) => {
  const problems = watchSite(page, baseURL);
  await page.goto('/');
  const pill = page.locator('.advisor-pill');
  await expect(pill).toBeVisible();
  await pill.click();   // the first click loads the advisor module and must open it
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  expect(problems, 'no errors while the advisor opens').toEqual([]);
  await expect(dialog, 'the dialog opens on the first click').toBeVisible();
  await dialog.getByLabel('Your question').fill('How much does it cost?');
  await dialog.getByLabel('Your question').press('Enter');
  const reply = dialog.locator('.msg.bot').last();
  await expect(reply).toContainText(`${money(TUITION.perTerm.Certificate)} per 12-week term`);
  await expect(reply).toContainText(money(TUITION.perTerm.Master));
  await expect(reply).not.toContainText(/guarantee|median/i);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(pill).toBeFocused();
  expect(problems).toEqual([]);
});

test('links from the old one-page site go to the new pages', async ({ page }) => {
  await page.goto('/#p-bs-ds');
  await expect(page).toHaveURL(new RegExp(`${P('bs-ds').url}$`));
  await page.goto('/#login');
  await expect(page).toHaveURL(/\/portal\/(#.*)?$/);
  await page.goto('/#trial');
  await expect(page).toHaveURL(/\/learn\/sample-lesson\/$/);
  await page.goto('/#programs');
  await expect(page).toHaveURL(/\/programs\/$/);
});

test('an unknown page returns 404 with the branded page', async ({ page, request }) => {
  const res = await page.goto('/no-such-page/');
  expect(res.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found | Nuvora');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('couldn’t find');
  await expect(page.locator('header.top')).toBeVisible();
  await expect(page.locator('main').getByRole('link', { name: 'All programs' })).toHaveAttribute('href', '/programs/');
  expect((await request.get('/no-such-file.css')).status()).toBe(404);
});

test('clean URLs: /programs redirects to /programs/', async ({ request }) => {
  const r = await request.get('/programs', { maxRedirects: 0 });
  expect(r.status()).toBe(301);
  expect(r.headers().location).toBe('/programs/');
  const q = await request.get(`${P('c-py').url.slice(0, -1)}?x=1`, { maxRedirects: 0 });
  expect(q.status()).toBe(301);
  expect(q.headers().location).toBe(`${P('c-py').url}?x=1`);
});

test('program key facts show the next start and an apply-by date 7 days earlier', async ({ page }) => {
  const [next] = nextStarts(1, todayInKolkata());
  for (const p of [P('bs-ds'), P('c-genai')]) {
    await page.goto(p.url);
    const facts = page.locator('[data-test=key-facts]');
    const fact = (name) => facts.locator('div').filter({ has: page.locator('dt', { hasText: name }) }).locator('dd');
    const start = await fact('Next start').locator('time').getAttribute('datetime');
    const applyBy = await fact('Apply by').locator('time').getAttribute('datetime');
    expect(start).toBe(isoDay(next.start));
    expect(fromIso(start) - fromIso(applyBy)).toBe(7 * DAY);
    await expect(fact('Next start')).toHaveText(fmtDay(next.start));
    await expect(fact('Apply by')).toHaveText(fmtDay(next.applyBy));
    await expect(fact('Tuition')).toContainText(money(p.tuition.perTerm));
  }
});

test.describe('a visitor in Los Angeles', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('sees the live class and office hours in local time', async ({ page }) => {
    await page.goto(P('c-genai').url);
    const cls = weeklyTimeIn(2, '19:00', 'America/Los_Angeles');
    const oh = weeklyTimeIn(4, '19:00', 'America/Los_Angeles');
    expect(cls.weekday).toBe('Tuesday');
    expect([5, 6]).toContain(cls.hour24);   // 13:30 UTC is 6:30 AM in summer and 5:30 AM in winter
    const local = page.locator('#workload [data-localtime]');
    await expect(local.first()).toHaveText(new RegExp(`^Your time: Tuesday ${cls.time.replace(/\s/g, '\\s')} \\(America/Los Angeles\\)`));
    await expect(local.nth(1)).toHaveText(new RegExp(`^Your time: Thursday ${oh.time.replace(/\s/g, '\\s')}`));
  });
});

test('a visitor in India is told the class times are already local', async ({ page }) => {
  await page.goto(P('c-genai').url);
  await expect(page.locator('#workload [data-localtime]').first()).toHaveText('That is your local time too.');
});

test('every Student login link goes to the portal', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('link', { name: 'Student login' });
  expect(await links.count()).toBeGreaterThanOrEqual(2);
  for (const href of await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')))) expect(href).toBe('/portal/');
  await page.locator('header.top a.login').click();
  await expect(page).toHaveURL(/\/portal\//);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('no video plays on the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.vstage img')).toBeVisible();
    await page.waitForTimeout(1500);
    const playing = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length);
    expect(playing).toBe(0);
    await expect(page.locator('[data-video-toggle]')).toBeHidden();
  });
});

test.describe('seat requests', () => {
  test('a complete request gets a reference', async ({ page, request }) => {
    const n = await one(request, "select count(*)::int as n from pg_proc where proname = 'request_seat'");
    test.skip(!n, 'The request_seat() database function is not in supabase/migrations yet, so the form has nothing to send to.');
    await reset(request);
    await page.goto('/admissions/?program=c-genai');
    const form = page.locator('form[data-seat-form]');
    await expect(form.getByLabel('Program')).toHaveValue('c-genai');
    await form.getByLabel('Full name').fill('Asha Rao');
    await form.getByLabel('Email').fill('asha.rao@nuvora.test');
    await form.getByLabel('Country you live in').fill('India');
    await form.getByLabel(/I agree/).check();
    await form.getByRole('button', { name: 'Send seat request' }).click();
    const result = page.locator('[data-seat-result]');
    await expect(result).toBeVisible();
    await expect(result.locator('[data-r="reference"]')).toHaveText(/\S{4,}/);
    await expect(result.locator('[data-r="program"]')).toContainText(P('c-genai').name);
  });

  // Runs with or without the database function: a request without consent must never leave the browser.
  test('without consent it shows an error and sends nothing', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => { if (/\/rest\/v1\/rpc\/request_seat/.test(r.url())) sent.push(r.url()); });
    await page.goto('/admissions/?program=c-genai');
    const form = page.locator('form[data-seat-form]');
    await expect(form.getByLabel('Program')).toHaveValue('c-genai');
    await form.getByLabel('Full name').fill('Asha Rao');
    await form.getByLabel('Email').fill('asha.rao@nuvora.test');
    await form.getByLabel('Country you live in').fill('India');
    const send = form.getByRole('button', { name: 'Send seat request' });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.locator('#sr-consent-err')).toBeVisible();
    await expect(page.locator('#sr-consent-err')).not.toBeEmpty();
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
    await expect(page.locator('[data-seat-result]')).toBeHidden();
  });
});
