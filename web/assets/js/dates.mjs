// Batch calendar rules, shared by the site build (Node) and the browser.
// Batches start on the first Monday of each month. Applications close 7 days before a start, and the closing
// day itself is still open (the same rule as the database function next_start_date). All dates are calendar
// dates in the batch time zone (America/New_York, US Eastern time), represented as Date objects at 00:00 UTC.
export const TIMEZONE = 'America/New_York';
export const TERM_WEEKS = 12;
const DAY = 86400000;

export function firstMonday(year, month) {
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function todayInBatchZone(now = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${s}T00:00:00Z`);
}

export const applyByFor = (start) => new Date(start.getTime() - 7 * DAY);

// The next `count` starts whose application window is still open on `today`.
export function nextStarts(count, today = todayInBatchZone()) {
  const out = [];
  let y = today.getUTCFullYear(), m = today.getUTCMonth();
  while (out.length < count) {
    const start = firstMonday(y, m);
    const applyBy = applyByFor(start);
    if (applyBy >= today) out.push({ start, applyBy });
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

// The first first-Monday on or after a date (used to place the next term after a 12-week term ends).
export function firstMondayOnOrAfter(date) {
  let y = date.getUTCFullYear(), m = date.getUTCMonth();
  for (;;) {
    const d = firstMonday(y, m);
    if (d >= date) return d;
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
}

// Term-by-term dates for a program that starts on `start`: each term runs 12 weeks (Monday to Sunday) and the
// next term starts on the first first-Monday after the previous one ends.
export function termDates(start, termCount) {
  const out = [];
  let s = start;
  for (let i = 0; i < termCount; i++) {
    const end = new Date(s.getTime() + (TERM_WEEKS * 7 - 1) * DAY);
    out.push({ term: i + 1, start: s, end });
    s = firstMondayOnOrAfter(new Date(end.getTime() + DAY));
  }
  return out;
}

export const isoDay = (d) => d.toISOString().slice(0, 10);
export const fromIso = (s) => new Date(`${s}T00:00:00Z`);
export const fmtDay = (d, opts = {}) => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', ...opts });
export const fmtLong = (d) => d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMonth = (d) => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });

// Minutes a time zone is ahead of UTC at an instant (New York: -240 in summer, -300 in winter).
function offsetMinutes(timeZone, at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - at.getTime()) / 60000);
}

// The real instant of a wall-clock time in the batch zone, given as milliseconds of that local time read as UTC.
// Daylight saving is handled by checking the offset again at the first estimate.
function zonedInstant(localMs) {
  const first = localMs - offsetMinutes(TIMEZONE, new Date(localMs)) * 60000;
  return new Date(localMs - offsetMinutes(TIMEZONE, new Date(first)) * 60000);
}

// A weekly class time in the batch zone ("Tuesday 19:00 US Eastern Time") shown in another time zone. Eastern Time has daylight saving,
// so 19:00 is 23:00 UTC in summer and 00:00 UTC (next day) in winter; the visitor's offset can still change with their own DST.
export function weeklyTimeIn(day, hhmm, timeZone, ref = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  // Find the next date (from ref) that falls on `day` (0 = Sunday) in the batch time zone.
  const base = todayInBatchZone(ref);
  const delta = (day - base.getUTCDay() + 7) % 7;
  const utc = zonedInstant(base.getTime() + delta * DAY + (h * 60 + m) * 60000);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', hour: 'numeric', minute: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(utc).map((p) => [p.type, p.value]));
  const hour24 = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(utc));
  return { weekday: parts.weekday, time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`, hour24, utc };
}






