// Nuvora portal: routing, the signed-in shell (sidebar, top bar, badges) and page lifecycle.
// Pages live in pages/*.js; each receives a context object and renders into the main area.
import { auth, rpc, onAuthChange, isConfigured, config, ApiError } from './api.js';
import { html, icon, wordmark, loading, initials, envBanner, fmtDateTime } from './ui.js';
import * as authPages from './pages/auth.js';
import * as student from './pages/student.js';
import * as staff from './pages/staff.js';
import * as admin from './pages/admin.js';
import * as adminAssistant from './pages/admin-assistant.js';
import * as adminOps from './pages/admin-ops.js';

const root = document.getElementById('app');
const STAFF_ROLES = new Set(['instructor', 'admin']);
const BATCH_KEY = 'nuvora.batch';
const NEXT_KEY = 'nuvora.next';

const ROUTES = [
  { path: 'login', page: authPages.login, public: true, title: 'Log in' },
  { path: 'signup', page: authPages.signup, public: true, title: 'Create your account' },
  { path: 'forgot', page: authPages.forgot, public: true, title: 'Reset your password' },
  { path: 'reset', page: authPages.reset, bare: true, title: 'Choose a new password' },
  { path: 'home', page: student.home, who: 'student', title: 'Home' },
  { path: 'course', page: student.course, who: 'student', title: 'My course' },
  { path: 'lesson/:id', page: student.lesson, title: 'Lesson', nav: 'course' },
  { path: 'live', page: student.live, who: 'student', title: 'Live classes' },
  { path: 'recording/:id', page: student.recording, who: 'student', title: 'Recording', nav: 'live' },
  { path: 'assignments', page: student.assignments, who: 'student', title: 'Assignments' },
  { path: 'notifications', page: student.notifications, title: 'Notifications' },
  { path: 'profile', page: student.profile, title: 'Profile' },
  { path: 'teach', page: staff.teach, who: 'staff', title: 'Teaching' },
  { path: 'grading', page: staff.grading, who: 'staff', title: 'Grading' },
  { path: 'roster/:id', page: staff.roster, who: 'staff', title: 'Roster', nav: 'teach' },
  { path: 'access', page: student.access, who: 'student', title: 'Portal access' },
  // Admin area: shown and reachable only for the admin role. The database checks the role on every call too.
  { path: 'admin', page: admin.overview, who: 'admin', title: 'Admin overview' },
  { path: 'admin/students', page: admin.students, who: 'admin', title: 'Students' },
  { path: 'admin/student/:id', page: admin.student, who: 'admin', title: 'Student', nav: 'admin/students' },
  { path: 'admin/batches', page: adminOps.batches, who: 'admin', title: 'Batches' },
  { path: 'admin/staff', page: adminOps.staff, who: 'admin', title: 'Staff' },
  { path: 'admin/requests', page: adminOps.requests, who: 'admin', title: 'Seat requests' },
  { path: 'admin/materials', page: adminOps.materials, who: 'admin', title: 'Materials' },
  { path: 'admin/assistant', page: adminAssistant.assistant, who: 'admin', title: 'Admin Assistant' },
];

const state = {
  me: null, dash: null, dashAt: 0, unread: 0, toGrade: 0,
  renderId: 0, cleanups: [], shell: false, flash: null, signingOut: false, lastLoad: 0, focus: null, routed: false,
};
const isStaff = () => STAFF_ROLES.has(state.me?.role);
const isAdmin = () => state.me?.role === 'admin';

// ---------------------------------------------------------------- routing
function match(hash) {
  const [pathPart, queryPart = ''] = hash.replace(/^#\/?/, '').split('?');
  const segs = pathPart.split('/').filter(Boolean);
  for (const r of ROUTES) {
    const want = r.path.split('/');
    if (want.length !== segs.length) continue;
    const params = {};
    if (want.every((w, i) => (w.startsWith(':') ? ((params[w.slice(1)] = decodeURIComponent(segs[i])), true) : w === segs[i]))) {
      return { r, params, query: new URLSearchParams(queryPart) };
    }
  }
  return { r: null, params: {}, query: new URLSearchParams() };
}

const homeHash = () => (!auth.session ? '#/login' : isAdmin() ? '#/admin' : isStaff() ? '#/teach' : '#/home');
// focus: a selector to move keyboard focus to once the page has rendered (for example a results heading).
function go(hash, focus = null) {
  state.focus = focus;
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const { r, params, query } = match(location.hash);
  const id = ++state.renderId;
  runCleanups();
  if (!r) return go(homeHash());

  if (r.public) {
    if (auth.session) return go(homeHash());
    teardownShell();
    return runPage(r, makeCtx(id, root, params, query));
  }
  if (!auth.session) {
    try { sessionStorage.setItem(NEXT_KEY, location.hash); } catch { /* ignore */ }
    return go('#/login');
  }
  if (r.bare) {
    teardownShell();
    return runPage(r, makeCtx(id, root, params, query));
  }
  if (!state.me) {
    teardownShell();
    root.innerHTML = String(loading());
    try { await loadDashboard(true); } catch (e) {
      if (id !== state.renderId) return;
      if (e instanceof ApiError && e.status === 401) return;            // signed out by the API layer
      root.innerHTML = String(errorView(e));
      root.querySelector('[data-retry]')?.addEventListener('click', () => route());
      return;
    }
    if (id !== state.renderId) return;
  }
  if (r.who === 'student' && isStaff()) return go(homeHash());
  if (r.who === 'staff' && !isStaff()) return go(homeHash());
  if (r.who === 'admin' && !isAdmin()) return go(homeHash());

  ensureShell();
  markNav(r.nav ?? r.path.replace(/\/:.*$/, ''));
  return runPage(r, makeCtx(id, document.getElementById('main'), params, query));
}

function makeCtx(id, main, params, query) {
  const ctx = {
    params, query, main, root,
    get me() { return state.me; },
    flash: takeFlash(),
    stale: () => id !== state.renderId,
    render(content) { if (!ctx.stale()) main.innerHTML = String(content); },
    onLeave(fn) { state.cleanups.push(fn); },
    dashboard: (fresh = false) => loadDashboard(fresh),
    invalidate() { state.dashAt = 0; },
    batch: () => selectedBatch(),
    setUnread, setToGrade, go, setFlash, afterSignIn,
    refresh: () => route(),
    setTitle(t) { document.title = `${t} · Nuvora`; },
    updateName(name) { if (state.me) state.me.name = name; renderUserButton(); },
    async signOut(message = 'You’ve signed out.') { state.signingOut = true; setFlash(message); await auth.signOut(); },
  };
  return ctx;
}

async function runPage(r, ctx) {
  document.title = `${r.title} · Nuvora`;
  const arrived = state.lastHash !== location.hash;
  const trail = focusTrail(ctx.main, document.activeElement);
  const wanted = state.focus;
  state.focus = null;
  try {
    // Show a spinner when arriving on a page, not when the same page refreshes itself.
    // Arriving on another page starts at its top, not at the old page's scroll position.
    if (ctx.main !== root && arrived) { ctx.render(loading()); window.scrollTo(0, 0); }
    state.lastHash = location.hash;
    await r.page(ctx);
    if (ctx.stale()) return;
    state.lastLoad = Date.now();
    // Not on the very first page of a visit: there the browser starts at the top, as on any website.
    if (state.routed && (wanted || trail.length || arrived)) restoreFocus(ctx.main, wanted, trail);
    state.routed = true;
  } catch (e) {
    if (ctx.stale()) return;
    if (e instanceof ApiError && e.status === 401) return;
    ctx.render(errorView(e));
    ctx.main.querySelector('[data-retry]')?.addEventListener('click', () => route());
  }
}

// ---------------------------------------------------------------- keyboard focus across renders
// A page that renders again (after an action, a filter or a search) replaces the control a keyboard user was
// on, and focus would fall back to the page body, at the top of the page. Before a page renders, note where
// focus was: the control itself (by id, or by its data attribute) and the headings of the sections around it.
// Afterwards, if focus was lost, it goes back to the same control if it is still there, else to the nearest
// of those headings that is, else to the page's h1.
function focusTrail(main, el) {
  if (!el || el === document.body || !main.contains(el)) return [];
  const trail = [];
  if (el.id) trail.push(`#${CSS.escape(el.id)}`);
  const data = [...el.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-busy' && a.value);
  if (data) trail.push(`${el.localName}[${data.name}="${CSS.escape(data.value)}"]`);
  for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
    const label = p.getAttribute('aria-labelledby')?.split(' ')[0];
    if (label) trail.push(`#${CSS.escape(label)}`);
  }
  return trail;
}
function restoreFocus(main, wanted, trail) {
  const now = document.activeElement;
  const lost = !now || now === document.body || !now.isConnected;
  if (!wanted && !lost) return;                               // the user has already moved on
  const target = [wanted, ...trail, 'h1'].filter(Boolean).map((sel) => main.querySelector(sel))
    .find((el) => el && el.getClientRects().length);
  if (!target) return;
  if (!target.matches('a[href], button, input, select, textarea, summary, [tabindex]')) target.tabIndex = -1;
  target.focus();
}

function runCleanups() {
  const list = state.cleanups.splice(0);
  for (const fn of list) { try { fn(); } catch (e) { console.error(e); } }
}

function errorView(e) {
  const missing = e?.code === 'P0002' || e?.status === 404;
  const offline = e?.code === 'network';
  return html`<div class="content"><section class="card empty" role="alert">
    <b>${missing ? 'This page isn’t available' : offline ? 'Can’t reach Nuvora' : 'Something went wrong'}</b>
    <p>${missing ? 'It may belong to a batch you’re not enrolled in, or it no longer exists.' : e?.message ?? ''}</p>
    <p class="row" style="justify-content:center;margin-top:14px">
      ${missing ? '' : html`<button class="btn primary sm" type="button" data-retry>Try again</button>`}
      <a class="btn ghost sm" href="${homeHash()}">Go to home</a></p>
  </section></div>`;
}

// ---------------------------------------------------------------- data shared across pages
async function loadDashboard(fresh) {
  if (!fresh && state.dash && Date.now() - state.dashAt < 30_000) return state.dash;
  const d = await rpc('my_dashboard');
  state.dash = d;
  state.dashAt = Date.now();
  state.me = d.profile;
  setUnread(d.unread_notifications);
  if (state.shell) { renderBatchPicker(); renderUserButton(); renderAccessBar(); }
  return d;
}

function selectedBatch() {
  const list = state.dash?.batches ?? [];
  let saved = null;
  try { saved = sessionStorage.getItem(BATCH_KEY); } catch { /* ignore */ }
  return list.find((b) => b.id === saved) ?? list[0] ?? null;
}

function setUnread(n) {
  state.unread = Math.max(0, Number(n) || 0);
  renderBadges();
}
function setToGrade(n) {
  state.toGrade = Math.max(0, Number(n) || 0);
  renderBadges();
}

function setFlash(message) { state.flash = message; }
function takeFlash() { const f = state.flash; state.flash = null; return f; }

// ---------------------------------------------------------------- shell

function ensureShell() {
  if (state.shell) return;
  const staffNav = [['teach', 'board', 'Teaching'], ['grading', 'grade', 'Grading', 'grade'], ['notifications', 'bell', 'Notifications', 'unread'], ['profile', 'user', 'Profile']];
  const studentNav = [['home', 'home', 'Home'], ['course', 'book', 'My course'], ['live', 'live', 'Live classes'], ['assignments', 'task', 'Assignments'], ['notifications', 'bell', 'Notifications', 'unread'], ['profile', 'user', 'Profile']];
  const adminNav = [['admin', 'gauge', 'Overview'], ['admin/students', 'users', 'Students'], ['admin/batches', 'calendar', 'Batches'],
    ['admin/staff', 'shield', 'Staff'], ['admin/requests', 'inbox', 'Seat requests'], ['admin/materials', 'pdf', 'Materials'],
    ['admin/assistant', 'route', 'Admin Assistant']];
  const link = ([p, ic, label, badge]) => html`<a class="snav" href="#/${p}" data-nav="${p}">${icon(ic)}<span>${label}</span>${badge ? html`<span class="count" data-badge="${badge}" hidden></span>` : ''}</a>`;
  const nav = isAdmin()
    ? html`<p class="navhead">Admin</p>${adminNav.map(link)}<p class="navhead">Teaching</p>${staffNav.map(link)}`
    : (isStaff() ? staffNav : studentNav).map(link);
  root.innerHTML = String(html`
    ${envBanner(config.environment)}
    <div class="app">
      <nav class="sidebar" aria-label="Portal">
        <div class="brand">${wordmark('#/')}<small>${isAdmin() ? 'Admin portal' : isStaff() ? 'Teaching portal' : 'Student portal'}</small></div>
        ${nav}
        <div class="grow"></div>
        ${isAdmin() ? '' : html`<div class="sidecard"><b>Need a hand?</b>Bring questions to your batch’s Thursday office hours. A support email will be published before the first batch.</div>`}
      </nav>
      <div class="main">
        <header class="topbar">
          <div class="grow" data-batchpick></div>
          <a class="iconbtn" href="#/notifications" data-bell aria-label="Notifications">${icon('bell')}<span class="dot" data-badge="unread-dot" hidden></span></a>
          <div class="user" data-user></div>
        </header>
        <div data-accessbar></div>
        <main id="main" tabindex="-1"></main>
      </div>
    </div>`);
  state.shell = true;
  state.lastHash = null;
  const bar = root.querySelector('.sidebar');
  bar.addEventListener('scroll', menuEdges, { passive: true });
  bar.addEventListener('focusin', menuFocus);
  renderBatchPicker();
  renderUserButton();
  renderAccessBar();
  renderBadges();
  startPolling();
}

// Tuition access, from the student's dashboard (the database decides it with its own clock): a calm notice
// during the last 7 days before access pauses, and for a paused program while another one is still open.
// When every program is paused, the pages themselves explain it instead (pausedView in pages/student.js).
const BAR_DAYS = 7;
function renderAccessBar() {
  const host = root.querySelector('[data-accessbar]');
  if (!host) return;
  const list = isStaff() ? [] : state.dash?.access ?? [];
  const soon = list.filter((a) => a.open && a.ends_at && a.days_left !== null && a.days_left <= BAR_DAYS);
  const paused = state.dash?.batches?.length ? list.filter((a) => !a.open) : [];
  const days = (n) => (n <= 0 ? 'today' : n === 1 ? 'in 1 day' : `in ${n} days`);
  host.innerHTML = String(html`${soon.map((a) => html`<div class="accessbar warn" role="status">${icon('clock')}
      <p><b>Your portal access to ${a.program} pauses ${days(a.days_left)}, on ${fmtDateTime(a.ends_at)}.</b>
        ${a.state === 'grace' ? `Term ${a.term} hasn’t been paid yet. Access continues as soon as your payment is recorded.`
          : 'Your extended access ends then, and the usual tuition rule applies again.'}</p>
      <a class="btn ghost sm" href="#/access">What this means</a></div>`)}
    ${paused.map((a) => html`<div class="accessbar bad" role="status">${icon('lock')}
      <p><b>Your portal access to ${a.program} is paused.</b> ${a.state === 'stopped_unpaid' ? `Term ${a.term} hasn’t been paid yet.` : 'Nuvora paused it.'}</p>
      <a class="btn ghost sm" href="#/access?paused=1">Details</a></div>`)}`);
}

function teardownShell() {
  if (!state.shell) return;
  state.shell = false;
  stopPolling();
}

function markNav(key) {
  for (const a of root.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  // On phones the menu is one sideways strip: bring the current page's item into view (only the strip scrolls).
  const bar = root.querySelector('.sidebar');
  const cur = bar?.querySelector('[aria-current="page"]');
  if (cur && bar.scrollWidth > bar.clientWidth) {
    const b = bar.getBoundingClientRect(), c = cur.getBoundingClientRect();
    bar.scrollLeft += c.left - b.left - (b.width - c.width) / 2;
  }
  menuEdges();
}

// The phone strip fades out at an edge while there are more items that way (.more-l / .more-r in portal.css),
// so nobody takes the visible items for the whole menu.
function menuEdges() {
  const bar = root.querySelector('.sidebar');
  if (!bar) return;
  const more = bar.scrollWidth - bar.clientWidth > 1;
  bar.classList.toggle('more-l', more && bar.scrollLeft > 1);
  bar.classList.toggle('more-r', more && bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1);
}
window.addEventListener('resize', menuEdges);
// A menu item reached with Tab is scrolled clear of the fades (the browser leaves a half-visible item where it is).
const FADE = 56;                                                    // the fade's width in portal.css
function menuFocus(e) {
  const bar = e.currentTarget;
  if (bar.scrollWidth <= bar.clientWidth) return;
  const b = bar.getBoundingClientRect(), c = e.target.getBoundingClientRect();
  if (c.left < b.left + FADE) bar.scrollLeft -= b.left + FADE - c.left;
  else if (c.right > b.right - FADE) bar.scrollLeft += c.right - (b.right - FADE);
}

function renderBatchPicker() {
  const host = root.querySelector('[data-batchpick]');
  if (!host) return;
  const list = isStaff() ? [] : state.dash?.batches ?? [];
  const cur = selectedBatch();
  if (list.length > 1) {
    host.innerHTML = String(html`<label class="batchpick">Batch <select data-batch-select>${list.map((b) => html`<option value="${b.id}"${b.id === cur?.id ? ' selected' : ''}>${b.code} · ${b.program}</option>`)}</select></label>`);
    host.querySelector('select').addEventListener('change', (e) => {
      try { sessionStorage.setItem(BATCH_KEY, e.target.value); } catch { /* ignore */ }
      route();
    });
  } else {
    host.innerHTML = cur ? String(html`<span class="batchchip" title="${cur.program}">${cur.code}</span>`) : '';
  }
}

function renderUserButton() {
  const host = root.querySelector('[data-user]');
  if (!host || !state.me) return;
  const me = state.me;
  host.innerHTML = String(html`
    <button type="button" aria-haspopup="true" aria-expanded="false" aria-label="Account menu: ${me.name || me.email}" data-usermenu><span class="av" aria-hidden="true">${initials(me.name, me.email)}</span><span>${me.name || me.email}</span></button>
    <div class="menu" hidden>
      <a href="#/profile">${icon('user')} Profile</a>
      <button type="button" data-signout>${icon('logout')} Sign out</button>
    </div>`);
  const btn = host.querySelector('[data-usermenu]');
  const menu = host.querySelector('.menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.addEventListener('click', close);
  host.querySelector('[data-signout]').addEventListener('click', async () => {
    state.signingOut = true;
    setFlash('You’ve signed out.');
    await auth.signOut();
  });
}
// Close the user menu on any outside click or Escape (registered once).
function closeUserMenu() {
  const host = root.querySelector('[data-user]');
  const menu = host?.querySelector('.menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  host.querySelector('[data-usermenu]').setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => { if (!root.querySelector('[data-user]')?.contains(e.target)) closeUserMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserMenu(); });

function renderBadges() {
  for (const el of root.querySelectorAll('[data-badge]')) {
    const n = el.dataset.badge === 'grade' ? state.toGrade : state.unread;
    el.hidden = n === 0;
    el.textContent = n > 99 ? '99+' : String(n);
  }
  const bell = root.querySelector('[data-bell]');
  if (bell) bell.setAttribute('aria-label', state.unread ? `Notifications, ${state.unread} unread` : 'Notifications');
}

// Keep badges current; refresh the page when the student comes back to the tab after a while.
let pollTimer = null;
function startPolling() {
  stopPolling();
  const tick = async () => {
    if (document.visibilityState !== 'visible' || !auth.session) return;
    try {
      setUnread((await rpc('my_notifications', { p_limit: 1 })).unread);
      if (isStaff()) setToGrade((await rpc('staff_grading_queue')).length);
    } catch { /* next tick */ }
  };
  tick();
  pollTimer = setInterval(tick, 60_000);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.shell) return;
  const page = match(location.hash).r?.path ?? '';
  if (Date.now() - state.lastLoad > 120_000 && !['lesson/:id', 'recording/:id'].includes(page)) {
    state.dashAt = 0;
    route();
  }
});

// ---------------------------------------------------------------- start
function boot() {
  if (!isConfigured()) {
    root.innerHTML = String(html`<div class="content"><section class="card empty"><b>The portal isn’t connected yet</b>
      <p>Add the project URL and public key to <span class="mono">portal/config.js</span>.</p></section></div>`);
    return;
  }
  // Returning from a password-reset email. replaceState (not location.hash) so the page renders once,
  // and the expired-link message is not wiped by a second render.
  const redirect = auth.consumeRedirect();
  if (redirect?.error) { setFlash(redirect.error); history.replaceState(null, '', '#/forgot'); }
  else if (redirect?.type === 'recovery') history.replaceState(null, '', '#/reset');

  let hadSession = Boolean(auth.session);
  onAuthChange((session) => {
    const wasSignedIn = hadSession;
    hadSession = Boolean(session);
    if (session) return;
    state.me = null;
    state.dash = null;
    state.dashAt = 0;
    teardownShell();
    if (!state.signingOut && wasSignedIn) setFlash('Your session ended. Please sign in again.');
    state.signingOut = false;
    try { sessionStorage.removeItem(BATCH_KEY); } catch { /* ignore */ }
    go('#/login');
  });

  window.addEventListener('hashchange', route);
  route();
}

// After signing in, return to the page the student originally asked for.
function afterSignIn() {
  let next = null;
  try { next = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch { /* ignore */ }
  const ok = next && match(next).r && !match(next).r.public && !match(next).r.bare;
  go(ok ? next : '#/home');
}

boot();
