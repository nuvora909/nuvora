// A build that is days or weeks old never shows a start that has passed or seat requests that have closed: the
// browser works every date out again from today's New York date (web/assets/js/site.js refreshDates), on load and
// when the date changes while the page is open. The browser clock is set with page.clock to days after the build.
import { test, expect } from './fixtures.mjs';
import { nextStarts, termDates, fmtDay, isoDay, fromIso } from '../../web/assets/js/dates.mjs';

const DAY = 86400000;
const plusDays = (d, n) => new Date(d.getTime() + n * DAY);
// 00:00 in New York on a date (04:00 or 05:00 UTC, by daylight saving).
const nyMidnight = (iso) => {
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return [4, 5].map((h) => new Date(`${iso}T0${h}:00:00Z`)).find((at) => clock.format(at) === '00:00');
};

// The next start written into the built page (read from the server, before any script runs).
async function builtStart(request) {
  const html = await (await request.get('/admissions/')).text();
  return fromIso(html.match(/<time datetime="([\d-]+)" data-date="start" data-n="0">/)[1]);
}

async function expectStarts(page, today) {
  const starts = nextStarts(6, today);
  const strip = page.locator('[data-strip]');
  await expect(strip.locator('time[data-date="start"]')).toHaveAttribute('datetime', isoDay(starts[0].start));
  await expect(strip.locator('time[data-date="start"]')).toHaveText(fmtDay(starts[0].start));
  await expect(strip.locator('time[data-date="applyBy"]')).toHaveText(fmtDay(starts[0].applyBy));
  const rows = page.locator('table[data-adm-dates] tbody tr');
  await expect(rows).toHaveCount(6);
  for (const [n, s] of starts.entries()) {
    const row = rows.nth(n);
    await expect(row.locator('time[data-date="start"]').first()).toHaveText(fmtDay(s.start));
    await expect(row.locator('time[data-date="applyBy"]')).toHaveText(fmtDay(s.applyBy));
    await expect(row.locator('time[data-date="end"]')).toHaveText(fmtDay(termDates(s.start, 1)[0].end));
  }
}

async function expectForm(page, today) {
  const starts = nextStarts(3, today);
  const values = await page.locator('select[name="start"] option').evaluateAll((os) => os.map((o) => o.value));
  expect(values).toEqual(starts.map((s) => isoDay(s.start)));
  // No date on the page is a start whose seat requests have closed.
  const shown = await page.locator('time[data-date="applyBy"]').evaluateAll((ts) => ts.map((t) => t.dateTime));
  for (const d of shown) expect(fromIso(d) >= today, `seat requests closing ${d} are still open on ${isoDay(today)}`).toBe(true);
}

test('three days after the build\'s next start, every date has moved on to the following starts', async ({ page, request }) => {
  const built = await builtStart(request);
  const today = plusDays(built, 3);
  await page.clock.install({ time: new Date(`${isoDay(today)}T16:00:00Z`) });
  await page.goto('/admissions/');
  const starts = nextStarts(6, today);
  expect(isoDay(starts[0].start)).not.toBe(isoDay(built));
  await expectStarts(page, today);
  await expectForm(page, today);
  // A program page: key facts and the term-by-term table follow too.
  await page.goto('/programs/bs-data-science/');
  await expect(page.locator('[data-test=key-facts] time[data-date="start"]').first()).toHaveText(fmtDay(starts[0].start));
  const path = page.locator('table[data-termpath]').first();
  await expect(path.locator('caption')).toHaveText(`If you start on ${fmtDay(starts[0].start)}`);
  const terms = termDates(starts[0].start, 2);
  await expect(path.locator('tr[data-term="2"] time').first()).toHaveText(fmtDay(terms[1].start));
});

test('on the closing day the build\'s start is still offered; the day after, it is gone', async ({ page, request }) => {
  const built = await builtStart(request);
  const closing = plusDays(built, -7);
  await page.clock.install({ time: new Date(`${isoDay(closing)}T20:00:00Z`) });
  await page.goto('/admissions/');
  await expectStarts(page, closing);
  await expectForm(page, closing);
  await expect(page.locator('[data-strip] time[data-date="start"]')).toHaveAttribute('datetime', isoDay(built));

  await page.clock.setSystemTime(new Date(`${isoDay(plusDays(closing, 1))}T14:00:00Z`));
  await page.reload();
  await expectStarts(page, plusDays(closing, 1));
  await expectForm(page, plusDays(closing, 1));
  await expect(page.locator(`select[name="start"] option[value="${isoDay(built)}"]`)).toHaveCount(0);
});

test('a page left open overnight moves on at midnight in New York, with no reload', async ({ page, request }) => {
  const built = await builtStart(request);
  const closing = plusDays(built, -7);
  const midnight = nyMidnight(isoDay(plusDays(closing, 1)));
  await page.clock.install({ time: new Date(midnight.getTime() - 2 * 60_000) });  // 23:58 on the closing day
  await page.goto('/admissions/');
  await expect(page.locator('[data-strip] time[data-date="start"]')).toHaveAttribute('datetime', isoDay(built));
  await page.clock.runFor(3 * 60_000);
  const next = nextStarts(1, plusDays(closing, 1))[0];
  await expect(page.locator('[data-strip] time[data-date="start"]')).toHaveAttribute('datetime', isoDay(next.start));
  await expectStarts(page, plusDays(closing, 1));
  await expectForm(page, plusDays(closing, 1));
});
