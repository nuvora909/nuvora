// Small UI toolkit: escaped HTML templates, formatting, icons and toasts.

// ---------------------------------------------------------------- safe HTML
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Mark trusted markup (icons, already-built fragments) so html`` does not escape it. */
export const raw = (s) => new Safe(String(s));

// null/undefined render as nothing; booleans render as "true"/"false" (attributes like aria-selected need them).
// Optional fragments use a ternary: ${cond ? html`...` : ''}.
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v === null || v === undefined ? '' : esc(v));
/** Tagged template: every interpolated value is HTML-escaped unless it is raw() or another html`` result. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Safe(out);
}

/** Only http(s) links may become clickable; anything else (javascript:, data:) is neutralised. */
export function safeUrl(url) {
  try { const u = new URL(String(url)); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

// The school's calendar: "today" follows US Eastern Time, as the database does (batch dates, payments, access).
export const SCHOOL_TZ = 'America/New_York';
export const schoolToday = (at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- formatting (always in the viewer's time zone)
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const dtf = (opts) => new Intl.DateTimeFormat(undefined, opts);
export const fmtDateTime = (iso) => dtf({ weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const fmtTime = (iso) => dtf({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const fmtDayMonth = (iso) => ({ day: dtf({ day: 'numeric' }).format(new Date(iso)), month: dtf({ month: 'short' }).format(new Date(iso)) });
/** 'YYYY-MM-DD' calendar dates are shown as-is, never shifted by time zone. */
export function fmtDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
}
export function fmtRelative(iso, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
export const fmtClock = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(sec).padStart(2, '0');
};
export const fmtMinutes = (s) => `${Math.round(s / 60)} min`;
export const fmtBytes = (n) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const pdfName = (title) => `${String(title).replace(/[^\w\- ]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 80) || 'document'}.pdf`;
export const initials = (name, email = '') => (String(name || email).trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();
export const firstName = (name, email = '') => String(name || '').trim().split(/\s+/)[0] || String(email).split('@')[0];

export const GRADE_LABEL = { distinguished: 'Distinguished', proficient: 'Proficient', basic: 'Basic', not_yet: 'Not yet' };
export const STATUS = {
  not_started: ['Not started', ''],
  overdue: ['Overdue', 'bad'],
  submitted: ['Submitted · awaiting review', 'info'],
  needs_resubmission: ['Resubmission needed', 'warn'],
  graded: ['Passed', 'good'],
};
export const statusPill = (s) => { const [label, tone] = STATUS[s] ?? [s, '']; return html`<span class="pill ${tone}">${label}</span>`; };

// ---------------------------------------------------------------- icons
const PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  live: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 7"/>',
  grade: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 3 1-6.2L3 9.7l6.2-.9z"/>',
  board: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 21l4-5 4 5"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  prev: '<path d="M15 6l-6 6 6 6"/>',
  ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v6H4V5h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  rec: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pdf: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 14h6M9 18h4"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.9 2.5-5 .2 1.6 1 2.6 2 3 0-3 .2-5.6.5-8z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  medal: '<path d="M12 2l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 15.3 6.8 18l1-5.8-4.2-4.1 5.8-.8z"/><path d="M8 21h8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/><path d="M4 18h16"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  upload: '<path d="M12 16V5"/><path d="M7 10l5-5 5 5"/><path d="M5 20h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
};
export const icon = (name, cls = 'ic') => raw(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`);

// The "nuv◯ra" wordmark: the ring carries the Meta logo gradient (#0064E0 to #0082FB); in dark mode, and on the
// navy sign-in panel, a lighter pair of the same blues (--wm-a, --wm-b, --wm-dot in portal.css).
export const wordmark = (href = '#/') => raw(`<a class="wm" href="${esc(href)}" aria-label="Nuvora home">nuv<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="wmg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style="stop-color:var(--wm-a)"/><stop offset="1" style="stop-color:var(--wm-b)"/></linearGradient></defs><circle cx="19" cy="23" r="13.5" fill="none" stroke="url(#wmg)" stroke-width="6.5"/><circle cx="34" cy="7" r="4.5" style="fill:var(--wm-dot)"/></svg>ra</a>`);

export const progressBar = (pct, done = false, label = '') =>
  html`<div class="bar${done ? ' done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"${label ? raw(` aria-label="${esc(label)}"`) : ''}><i style="width:${Math.max(0, Math.min(100, Number(pct) || 0))}%"></i></div>`;

export const envBanner = (environment) => (environment === 'local'
  ? html`<div class="envbar" role="note">Local test environment · demo data only · nothing here is real or sent anywhere</div>` : '');

export const loading = () => html`<div class="loading" role="status"><div class="spinner"></div><span class="sr">Loading</span></div>`;

// ---------------------------------------------------------------- busy buttons
/**
 * Runs fn while the button shows it is working. The button is marked aria-disabled (and ignores more clicks)
 * instead of disabled: disabling the focused button would drop a keyboard user's focus to the page body.
 */
export async function busy(button, fn) {
  if (!button) return fn();
  if (button.dataset.busy) return undefined;
  button.dataset.busy = '1';
  button.setAttribute('aria-disabled', 'true');
  try { return await fn(); } finally {
    delete button.dataset.busy;
    button.removeAttribute('aria-disabled');
  }
}

// ---------------------------------------------------------------- toast
// The live region is in index.html from the start and is never hidden, only emptied: screen readers announce
// a region they already know about, not one inserted (or shown) together with its text. The message is set a
// moment after the region is cleared, so the same message twice is announced twice.
let toastTimer;
let toastShow;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.append(el);
  }
  clearTimeout(toastTimer);
  clearTimeout(toastShow);
  el.textContent = '';
  toastShow = setTimeout(() => {
    el.textContent = message;
    el.classList.add('show');
    toastTimer = setTimeout(() => { el.classList.remove('show'); el.textContent = ''; }, 6000);
  }, 50);
}
