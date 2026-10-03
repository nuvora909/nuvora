// The batch calendar the website shows must be the one the database runs: the same next start for every day of
// the year, 12-week terms on first Mondays, and the live class shown in the visitor's own time zone.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from '../db/helpers.mjs';
import {
  nextStarts, firstMonday, firstMondayOnOrAfter, termDates, todayInKolkata, weeklyTimeIn, applyByFor, isoDay, fromIso, fmtDay, TERM_WEEKS, TIMEZONE,
} from '../../web/assets/js/dates.mjs';
import { PROGRAMS, LIVE_PATTERN } from '../../web/data/programs.mjs';

const DAY = 86400000;
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const isFirstMonday = (d) => d.getUTCDay() === 1 && d.getUTCDate() <= 7;

// Days around every month boundary, every application deadline and every year end from 2025 to 2028.
const DATES = (() => {
  const set = new Set();
  for (let y = 2025; y <= 2028; y++) {
    for (let m = 0; m < 12; m++) {
      const first = new Date(Date.UTC(y, m, 1));
      const fm = firstMonday(y, m);
      for (const d of [first, addDays(first, -1), addDays(first, 1), addDays(fm, -8), addDays(fm, -7), addDays(fm, -6), addDays(fm, -1), fm, addDays(fm, 1)]) set.add(isoDay(d));
    }
    for (const md of ['12-24', '12-25', '12-26', '12-31', '01-01', '01-02', '02-28', '02-29']) {
      const d = fromIso(`${y}-${md}`);
      if (isoDay(d) === `${y}-${md}`) set.add(isoDay(d)); // skips 29 Feb outside leap years
    }
  }
  return [...set].sort();
})();

let h;
before(async () => { h = await freshDb(); });

test('the website and the database agree on the next start for every day tested', async () => {
  assert.ok(DATES.length >= 40, `${DATES.length} dates`);
  const differ = [];
  for (const iso of DATES) {
    const db = await h.one(h.sql, 'select public.next_start_date($1::date)::text', [iso]);
    const web = isoDay(nextStarts(1, fromIso(iso))[0].start);
    if (db !== web) differ.push(`${iso}: database ${db}, website ${web}`);
  }
  assert.deepEqual(differ, []);
});

test('seat requests close 7 days before a start, and the closing day itself is still open', () => {
  for (const iso of DATES) {
    const today = fromIso(iso);
    const starts = nextStarts(4, today);
    starts.forEach(({ start, applyBy }, i) => {
      assert.ok(isFirstMonday(start), `${iso}: ${isoDay(start)} is a first Monday`);
      assert.equal(applyBy - start, -7 * DAY, `${iso}: apply by is 7 days before the start`);
      assert.equal(isoDay(applyByFor(start)), isoDay(applyBy));
      assert.ok(applyBy >= today, `${iso}: ${isoDay(start)} is still open`);
      if (i) assert.ok(start > starts[i - 1].start, `${iso}: starts are in order`);
    });
    // No first Monday between today and the first offered start is still open.
    const first = starts[0].start;
    for (let d = today; d < first; d = addDays(d, 1)) if (isFirstMonday(d)) assert.ok(addDays(d, -7) < today, `${iso}: ${isoDay(d)} was skipped while open`);
  }
  const fm = firstMonday(2026, 10);   // Monday 2 November 2026
  assert.equal(isoDay(fm), '2026-11-02');
  assert.equal(isoDay(nextStarts(1, addDays(fm, -7))[0].start), '2026-11-02', 'open on the closing day');
  assert.equal(isoDay(nextStarts(1, addDays(fm, -6))[0].start), '2026-12-07', 'closed the day after');
});

test('terms run 12 weeks, start on first Mondays and never overlap', () => {
  for (const iso of DATES.filter((_, i) => i % 3 === 0)) {
    const { start } = nextStarts(1, fromIso(iso))[0];
    for (const n of new Set([1, 4, 12, ...PROGRAMS.map((p) => p.termCount)])) {
      const terms = termDates(start, n);
      assert.equal(terms.length, n);
      terms.forEach((t, i) => {
        assert.equal(t.term, i + 1);
        assert.ok(isFirstMonday(t.start), `${isoDay(t.start)} is a first Monday`);
        assert.equal(t.end.getUTCDay(), 0, `term ${t.term} ends on a Sunday`);
        assert.equal((t.end - t.start) / DAY + 1, TERM_WEEKS * 7, `term ${t.term} is 84 days long`);
        if (i) {
          const prev = terms[i - 1];
          assert.ok(t.start > prev.end, `term ${t.term} starts after term ${prev.term} ends`);
          assert.equal(isoDay(t.start), isoDay(firstMondayOnOrAfter(addDays(prev.end, 1))), `term ${t.term} starts on the next first Monday`);
          assert.ok((t.start - prev.end) / DAY <= 36, 'the break between terms is at most about a month');
        }
      });
    }
  }
  assert.equal(TERM_WEEKS, LIVE_PATTERN.weeks);
});

test('first Mondays across month and year ends', () => {
  assert.deepEqual([[2026, 0], [2026, 1], [2026, 5], [2026, 11], [2027, 0], [2028, 1]].map(([y, m]) => isoDay(firstMonday(y, m))),
    ['2026-01-05', '2026-02-02', '2026-06-01', '2026-12-07', '2027-01-04', '2028-02-07']);
  assert.equal(isoDay(firstMondayOnOrAfter(fromIso('2026-12-08'))), '2027-01-04');
  assert.equal(isoDay(firstMondayOnOrAfter(fromIso('2026-12-07'))), '2026-12-07');
  assert.equal(fmtDay(fromIso('2027-01-04')), 'Jan 4, 2027');
});

test('today is the calendar date in India', () => {
  assert.equal(TIMEZONE, 'Asia/Kolkata');
  assert.equal(isoDay(todayInKolkata(new Date('2026-10-01T18:29:00Z'))), '2026-10-01', '23:59 IST');
  assert.equal(isoDay(todayInKolkata(new Date('2026-10-01T18:30:00Z'))), '2026-10-02', '00:00 IST');
  assert.equal(isoDay(todayInKolkata(new Date('2026-12-31T19:00:00Z'))), '2027-01-01', 'new year arrives in India first');
});

test('the Tuesday 19:00 IST class in other time zones, on both sides of daylight saving', () => {
  const cases = [
    // [reference instant, zone, weekday, time, 24h hour, UTC instant of the class]
    ['2026-07-01T12:00:00Z', 'America/Los_Angeles', 'Tuesday', '6:30 AM', 6, '2026-07-07T13:30:00.000Z'],   // PDT, UTC-7
    ['2026-12-01T12:00:00Z', 'America/Los_Angeles', 'Tuesday', '5:30 AM', 5, '2026-12-01T13:30:00.000Z'],   // PST, UTC-8
    ['2026-10-28T12:00:00Z', 'America/Los_Angeles', 'Tuesday', '5:30 AM', 5, '2026-11-03T13:30:00.000Z'],   // DST ends 1 Nov in between
    ['2026-07-01T12:00:00Z', 'Asia/Kolkata', 'Tuesday', '7:00 PM', 19, '2026-07-07T13:30:00.000Z'],
    ['2026-12-01T12:00:00Z', 'Asia/Kolkata', 'Tuesday', '7:00 PM', 19, '2026-12-01T13:30:00.000Z'],
    ['2026-07-01T12:00:00Z', 'Europe/London', 'Tuesday', '2:30 PM', 14, '2026-07-07T13:30:00.000Z'],
    ['2026-12-01T12:00:00Z', 'Europe/London', 'Tuesday', '1:30 PM', 13, '2026-12-01T13:30:00.000Z'],
    ['2026-07-01T12:00:00Z', 'Pacific/Auckland', 'Wednesday', '1:30 AM', 1, '2026-07-07T13:30:00.000Z'],
    ['2026-12-01T12:00:00Z', 'Pacific/Auckland', 'Wednesday', '2:30 AM', 2, '2026-12-01T13:30:00.000Z'],
  ];
  for (const [ref, zone, weekday, time, hour24, utc] of cases) {
    const t = weeklyTimeIn(LIVE_PATTERN.classDay, LIVE_PATTERN.classTime, zone, new Date(ref));
    assert.equal(t.weekday, weekday, `${zone} from ${ref}`);
    assert.equal(t.time.replace(/ /g, ' '), time, `${zone} from ${ref}`);
    assert.equal(t.hour24, hour24, `${zone} from ${ref}`);
    assert.equal(t.utc.toISOString(), utc, `${zone} from ${ref}`);
  }
  // Thursday office hours, from a Wednesday evening in India.
  const oh = weeklyTimeIn(LIVE_PATTERN.officeDay, LIVE_PATTERN.officeTime, 'America/New_York', new Date('2026-10-07T15:00:00Z'));
  assert.deepEqual([oh.weekday, oh.time.replace(/ /g, ' '), oh.utc.toISOString()], ['Thursday', '9:30 AM', '2026-10-08T13:30:00.000Z']);
});
