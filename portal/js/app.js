// Nuvora portal: routing, the signed-in shell (sidebar, top bar, badges) and page lifecycle.
// Pages live in pages/*.js; each receives a context object and renders into the main area.
import { auth, rpc, onAuthChange, isConfigured, config, ApiError } from './api.js';
import { html, icon, wordmark, loading, initials, envBanner } from './ui.js';
import * as authPages from './pages/auth.js';
import * as student from './pages/student.js';
import * as staff from './pages/staff.js';

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
];

const state = {
  me: null, dash: null, dashAt: 0, unread: 0, toGrade: 0,
  renderId: 0, cleanups: [], shell: false, flash: null, signingOut: false, lastLoad: 0,
};
const isStaff = () => STAFF_ROLES.has(state.me?.role);

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

const homeHash = () => (!auth.session ? '#/login' : isStaff() ? '#/teach' : '#/home');
function go(hash) {
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
  if (r.who === 'student' && isStaff()) return go('#/teach');
  if (r.who === 'staff' && !isStaff()) return go('#/home');

  ensureShell();
  markNav(r.nav ?? r.path.split('/')[0]);
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
  try {
    // Show a spinner when arriving on a page, not when the same page refreshes itself.
    if (ctx.main !== root && state.lastHash !== location.hash) ctx.render(loading());
    state.lastHash = location.hash;
    await r.page(ctx);
    if (!ctx.stale()) state.lastLoad = Date.now();
  } catch (e) {
    if (ctx.stale()) return;
    if (e instanceof ApiError && e.status === 401) return;
    ctx.render(errorView(e));
    ctx.main.querySelector('[data-retry]')?.addEventListener('click', () => route());
  }
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
  if (state.shell) { renderBatchPicker(); renderUserButton(); }
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
  const nav = isStaff() ? staffNav : studentNav;
  root.innerHTML = String(html`
    ${envBanner(config.environment)}
    <div class="app">
      <nav class="sidebar" aria-label="Portal">
        <div class="brand">${wordmark('#/')}<small>${isStaff() ? 'Teaching portal' : 'Student portal'}</small></div>
        ${nav.map(([p, ic, label, badge]) => html`<a class="snav" href="#/${p}" data-nav="${p}">${icon(ic)}<span>${label}</span>${badge ? html`<span class="count" data-badge="${badge}" hidden></span>` : ''}</a>`)}
        <div class="grow"></div>
        <div class="sidecard"><b>Need a hand?</b>Bring questions to your batch’s Thursday office hours, or reply to any Nuvora email.</div>
      </nav>
      <div class="main">
        <header class="topbar">
          <div class="grow" data-batchpick></div>
          <a class="iconbtn" href="#/notifications" data-bell aria-label="Notifications">${icon('bell')}<span class="dot" data-badge="unread-dot" hidden></span></a>
          <div class="user" data-user></div>
        </header>
        <main id="main" tabindex="-1"></main>
      </div>
    </div>`);
  state.shell = true;
  state.lastHash = null;
  renderBatchPicker();
  renderUserButton();
  renderBadges();
  startPolling();
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
