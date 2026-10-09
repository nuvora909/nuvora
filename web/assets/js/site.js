// Shared behaviour for every public page. Pages work without JavaScript; this adds live dates, local class
// times, menus, filters, the career ladder, example-screen hotspots, the saved plan and the advisor entry points.
// cinema.js adds the pointer spotlight on dark sections; the rest of the cinematic motion is CSS (site.css).
import { nextStarts, termDates, fmtDay, isoDay, weeklyTimeIn, fromIso, TIMEZONE } from './dates.mjs';
import './cinema.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- storage (may be unavailable in private windows) ----------
export const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
export const PLAN_KEY = 'nuvora.plan';
const PLAN_DAYS = 90;
// A plan that is unreadable, malformed, from another version or older than PLAN_DAYS is removed, not just ignored.
export function savedPlan() {
  const plan = store.get(PLAN_KEY);
  const age = Date.now() - Number(plan?.savedAt);
  if (plan?.v === 1 && plan.match && age >= 0 && age <= PLAN_DAYS * 86400000) return plan;
  store.del(PLAN_KEY);
  return null;
}

// ---------- artifact preview: relative links (see scripts/build-site.mjs) ----------
// Preview builds mark <html data-root="../"> and use relative links; links created at run time are mapped the same
// way just before they are followed. On the real site data-root is absent and nothing changes.
const ROOT = document.documentElement.dataset.root;
export function siteHref(href) {
  if (ROOT == null || !href.startsWith('/') || href.startsWith('//')) return href;
  const [, p0, rest] = /^([^?#]*)(.*)$/.exec(href);
  let p = p0 === '/portal' || p0.startsWith('/portal/') ? '/portal-preview/' : p0;
  if (p.endsWith('/')) p += 'index.html';
  return ROOT + p.slice(1) + rest;
}
if (ROOT != null) {
  const fix = (e) => { const a = e.target.closest?.('a[href^="/"]'); if (a) a.setAttribute('href', siteHref(a.getAttribute('href'))); };
  for (const type of ['click', 'auxclick', 'focusin', 'pointerover']) document.addEventListener(type, fix, true);
}

// ---------- old single-page links (#p-bs-ds, #login, ...) go to the new pages ----------
const OLD = { programs: '/programs/', how: '/how-it-works/', tuition: '/tuition/', admissions: '/admissions/', counsel: '/admissions/#request',
  login: '/portal/', dashboard: '/portal/', legal: '/legal/terms/', privacy: '/legal/privacy/', terms: '/legal/terms/', credits: '/legal/credits/',
  trial: '/learn/sample-lesson/', credit: '/programs/', models: '/about/', home: '/' };
const SLUGS = { 'bs-ds': 'bs-data-science', 'bs-aiml': 'bs-ai-machine-learning', 'ms-aml': 'ms-applied-machine-learning', 'ms-ds': 'ms-data-science-analytics',
  'c-py': 'certificate-python-data-analysis', 'c-genai': 'certificate-generative-ai-llm-apps', 'c-mlops': 'certificate-mlops-data-engineering' };
if ((location.pathname === '/' || ROOT === './') && location.hash.length > 1) {
  const h = location.hash.slice(1);
  const to = h.startsWith('p-') && SLUGS[h.slice(2)] ? `/programs/${SLUGS[h.slice(2)]}/` : OLD[h];
  if (to && to !== '/') location.replace(siteHref(to));
}

// ---------- live dates ----------
function refreshDates() {
  const starts = nextStarts(6);
  for (const el of $$('time[data-date]')) {
    const s = starts[Number(el.dataset.n || 0)];
    const d = el.dataset.date === 'applyBy' ? s.applyBy : s.start;
    el.dateTime = isoDay(d);
    el.textContent = fmtDay(d);
  }
  for (const table of $$('table[data-termpath]')) {
    const rows = termDates(starts[0].start, Number(table.dataset.termpath));
    const cap = table.querySelector('caption');
    if (cap) cap.textContent = `If you start on ${fmtDay(starts[0].start)}`;
    for (const tr of table.querySelectorAll('tr[data-term]')) {
      const r = rows[Number(tr.dataset.term) - 1];
      const [a, b] = tr.querySelectorAll('time');
      a.dateTime = isoDay(r.start); a.textContent = fmtDay(r.start);
      b.dateTime = isoDay(r.end); b.textContent = fmtDay(r.end);
    }
  }
  for (const el of $$('[data-year]')) el.textContent = String(new Date().getFullYear());
}

// ---------- class times in the visitor's time zone ----------
function localTimes() {
  let tz;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return; }
  if (!tz) return;
  for (const el of $$('[data-localtime]')) {
    const [day, time] = el.dataset.localtime.split('|');
    if (tz === TIMEZONE) { el.textContent = 'That is your local time too.'; continue; }
    const t = weeklyTimeIn(Number(day), time, tz);
    const late = t.hour24 >= 22 || t.hour24 < 6;
    el.textContent = `Your time: ${t.weekday} ${t.time} (${tz.replace(/_/g, ' ')})${late ? '. Outside usual hours, so recordings are there when you need them.' : ''}`;
  }
}

// ---------- header menus ----------
function menus() {
  const menusEls = $$('details[data-mega], details[data-mnav]');
  const closeAll = (except) => menusEls.forEach((d) => { if (d !== except) d.open = false; });
  document.addEventListener('click', (e) => { if (!e.target.closest('details[data-mega], details[data-mnav]')) closeAll(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = menusEls.find((d) => d.open);
    if (open) { open.open = false; open.querySelector('summary').focus(); }
  });
  for (const d of menusEls) {
    d.addEventListener('toggle', () => {
      if (d.open) closeAll(d);
      if (d.matches('[data-mnav]')) {
        document.documentElement.style.overflow = d.open ? 'hidden' : '';
        d.querySelector('summary').setAttribute('aria-label', d.open ? 'Close menu' : 'Menu');
      }
    });
    d.addEventListener('focusout', (e) => { if (d.open && !d.contains(e.relatedTarget) && e.relatedTarget) d.open = false; });
  }
  // Menus are closed when the visitor navigates back to a cached page.
  window.addEventListener('pageshow', () => closeAll());
}

// ---------- career ladder ----------
function ladders() {
  for (const root of $$('[data-ladder]')) {
    const tabs = $$('[role=tab]', root);
    const select = (tab) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
      }
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = tabs[(i + d + tabs.length) % tabs.length];
        select(next); next.focus();
      });
    });
    for (const panel of $$('[role=tabpanel]', root)) {
      const steps = $$('[data-step]', panel);
      steps.forEach((s) => s.addEventListener('click', () => {
        const open = s.getAttribute('aria-expanded') !== 'true';
        for (const x of steps) {
          x.setAttribute('aria-expanded', String(open && x === s));
          $(`#${x.getAttribute('aria-controls')}`).hidden = !(open && x === s);
        }
      }));
    }
  }
}

// ---------- hotspots on example screens ----------
function hotspots() {
  for (const b of $$('[data-hotspots] .hs')) {
    b.addEventListener('click', () => {
      const tip = $(`#${b.getAttribute('aria-controls')}`);
      const open = tip.hidden;
      for (const other of $$('[data-hotspots] .hs')) { other.setAttribute('aria-expanded', 'false'); $(`#${other.getAttribute('aria-controls')}`).hidden = true; }
      b.setAttribute('aria-expanded', String(open));
      tip.hidden = !open;
    });
  }
}

// ---------- saved plan (opt-in, this device only) ----------
function personalize() {
  const plan = savedPlan();
  if (!plan) return;
  const strip = $('[data-strip] .wrap');
  if (strip) {
    strip.replaceChildren();
    const span = document.createElement('span');
    span.innerHTML = '<b>Welcome back</b> · Your match: ';
    span.append(document.createTextNode(plan.matchName));
    const a = document.createElement('a');
    a.href = '/find-your-program/#result';
    a.textContent = 'See your learning path →';
    strip.append(span, a);
  }
  for (const grid of $$('[data-program-grid] .cards')) {
    const card = grid.querySelector(`.pcard[data-program="${CSS.escape(plan.match)}"]`);
    if (!card) continue;
    card.classList.add('is-match');
    card.querySelector('[data-match-badge]').hidden = false;
    grid.prepend(card);
  }
}

// ---------- AI advisor entry points (the drawer loads on first use) ----------
function advisorButtons() {
  const buttons = $$('[data-advisor-open]');
  if (!buttons.length) return;
  let mod;
  // currentTarget is only set while the event is dispatched, so read it before the first await.
  const open = async (e) => {
    const btn = e.currentTarget;
    mod ??= await import('./advisor.js');
    mod.openAdvisor({ returnFocus: btn, prompt: btn.dataset.prompt });
  };
  buttons.forEach((b) => { b.hidden = false; b.addEventListener('click', open); });
  // The buttons start with honest labels ("Ask Nuvora", catalog answers). Only a connected AI model earns the AI ones.
  import('./advisor-engine.mjs').then(({ aiAvailable }) => {
    if (!aiAvailable()) return;
    for (const el of $$('[data-advisor-label]')) el.textContent = 'AI Advisor';
    for (const el of $$('[data-advisor-more]')) el.textContent = '· Ask Nuvora AI';
    for (const el of $$('[data-advisor-mlabel]')) el.textContent = 'Ask AI';
  });
}

// ---------- Brochure modal entry points ----------
function brochureButtons() {
  const buttons = $$('[data-brochure-trigger]');
  if (!buttons.length) return;
  let mod;
  const open = async (e) => {
    const btn = e.currentTarget;
    mod ??= await import('./brochure.js');
    const programId = btn.dataset.programId;
    mod.openBrochure({ programId, returnFocus: btn });
  };
  buttons.forEach((b) => { b.hidden = false; b.addEventListener('click', open); });
}

// Initialize everything
refreshDates();
localTimes();
menus();
ladders();
hotspots();
personalize();
advisorButtons();
brochureButtons();
export { $, $$, fromIso };