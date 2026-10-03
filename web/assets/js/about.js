// About, contact and legal pages. The legal pages get a table of contents that highlights the section being read
// (and folds away on phones), and the privacy notice gets a check of what this browser holds for Nuvora right now,
// with a way to remove the saved plan. Every page works without this file.
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Storage can be unavailable (private windows, blocked site data), so every access is guarded.
const read = (area, key) => { try { return window[area].getItem(key); } catch { return null; } };
const remove = (area, key) => { try { window[area].removeItem(key); } catch { /* ignore */ } };

const PLAN_KEY = 'nuvora.plan';
const ANSWERS_KEY = 'nuvora.answers';
const SESSION_KEY = 'nuvora.session';
const PLAN_DAYS = 90;
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// ---------- legal table of contents ----------
function toc() {
  const box = document.querySelector('[data-abt-toc]');
  if (!box) return;
  const links = $$('a[href^="#"]', box);
  const sections = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  const narrow = window.matchMedia('(max-width: 960px)');
  // On phones the list starts folded so the notice itself comes first; it stays open on wider screens.
  if (narrow.matches) box.open = false;
  links.forEach((a) => a.addEventListener('click', () => { if (narrow.matches) box.open = false; }));

  if (!('IntersectionObserver' in window) || !sections.length) return;
  const visible = new Set();
  const mark = (current) => {
    for (const a of links) {
      const on = a.hash === `#${current.id}`;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    }
  };
  // At the very bottom a short last section may never reach the band, so it is marked there instead.
  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  const update = () => {
    const current = atBottom() ? sections[sections.length - 1] : sections.find((s) => visible.has(s));
    if (current) mark(current);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); }
    update();
  }, { rootMargin: '-18% 0px -66% 0px' });
  sections.forEach((s) => io.observe(s));
  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (atBottom()) update(); });
  }, { passive: true });
}

// ---------- "what this browser holds" on the privacy notice ----------
function plan() {
  const raw = read('localStorage', PLAN_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p.savedAt !== 'number') return 'Saved plan found';
    const until = p.savedAt + PLAN_DAYS * 86400000;
    if (until < Date.now()) return 'An expired plan (older than 90 days); the site no longer uses it';
    return `Saved on ${day(p.savedAt)}; used until ${day(until)}`;
  } catch {
    return 'Saved plan found';
  }
}

const CHECKS = {
  plan,
  answers: () => (read('sessionStorage', ANSWERS_KEY) ? 'Answers kept for this visit' : null),
  session: () => {
    if (read('localStorage', SESSION_KEY)) return 'Signed in, remembered on this device';
    if (read('sessionStorage', SESSION_KEY)) return 'Signed in for this tab only';
    return null;
  },
};

function deviceCheck() {
  const root = document.querySelector('[data-abt-device]');
  if (!root) return;
  const forget = root.querySelector('[data-abt-forget]');
  const status = root.querySelector('[data-abt-status]');

  const render = () => {
    for (const el of $$('[data-abt-key]', root)) {
      const value = CHECKS[el.dataset.abtKey]?.();
      el.dataset.state = value ? 'yes' : 'no';
      el.textContent = value ?? 'Nothing stored';
    }
    if (forget) forget.hidden = !(read('localStorage', PLAN_KEY) || read('sessionStorage', ANSWERS_KEY));
  };

  forget?.addEventListener('click', () => {
    remove('localStorage', PLAN_KEY);
    remove('sessionStorage', ANSWERS_KEY);
    render();
    if (status) status.textContent = 'Your saved plan and answers have been removed from this browser.';
    status?.focus();
  });
  // Another tab may save or forget a plan while this page is open.
  window.addEventListener('storage', render);
  window.addEventListener('pageshow', render);
  render();
  root.hidden = false;
}

toc();
deviceCheck();
