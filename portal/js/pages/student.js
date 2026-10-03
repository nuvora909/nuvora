// Student pages: home, course, lesson, live classes, recordings, assignments, notifications and profile.
import { rpc, rpcOnUnload, auth, downloadPdf, ApiError } from '../api.js';
import {
  html, icon, toast, $, $$, safeUrl, progressBar, statusPill, GRADE_LABEL,
  fmtDate, fmtDateTime, fmtTime, fmtDayMonth, fmtRelative, fmtClock, fmtMinutes, fmtBytes, pdfName, firstName, localZone,
} from '../ui.js';
import { DemoPlayer, WatchTracker } from '../player.js';

const notFound = () => new ApiError('Not found', 404, 'P0002');
const weekOf = (b) => {
  const [y, m, d] = b.starts_on.split('-').map(Number);
  const days = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
  return days < 0 ? 0 : Math.min(12, Math.floor(days / 7) + 1);
};
const weekLabel = (b) => (weekOf(b) === 0 ? `Starts ${fmtDate(b.starts_on)}` : `Week ${weekOf(b)} of 12`);
const joinButton = (s, cls = 'btn primary sm') => {
  const url = s.join_url && safeUrl(s.join_url);
  return url
    ? html`<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${icon('live')} Join class</a>`
    : html`<button class="btn ghost sm" type="button" disabled title="Join opens 15 minutes before class">Join opens 15 min before</button>`;
};
const dateBox = (iso) => { const d = fmtDayMonth(iso); return html`<div class="datebox" aria-hidden="true"><b>${d.day}</b><small>${d.month}</small></div>`; };

// PDF materials: the only downloadable content. Each click asks for a fresh 60-second link.
const materialsList = (list, heading) => (list?.length ? html`<div class="box materials"><h3>${heading}</h3>
  ${list.map((m) => html`<div class="item"><span class="row" style="flex:1 1 220px;min-width:0">${icon('pdf')}<span class="meta"><b>${m.title}</b><span>PDF · ${fmtBytes(m.size_bytes)}</span></span></span>
    <button class="btn ghost sm" type="button" data-download="${m.file_path}" data-name="${pdfName(m.title)}">${icon('download')} Download PDF</button></div>`)}
  </div>` : '');

function wireDownloads(root) {
  for (const b of $$('[data-download]', root)) {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await downloadPdf(b.dataset.download, b.dataset.name); } catch (e) { toast(e.message); } finally { b.disabled = false; }
    });
  }
}

// Between terms: the next term's seat is held, but opens only once the enrollment is confirmed.
function reservedView(reserved) {
  return html`<header class="band"><div><h1>Your next term</h1><p class="sub">You finished your last term. Your seat in the next one is reserved.</p></div></header>
  <div class="content">${reserved.map((r) => html`<section class="card empty" aria-labelledby="r-${r.id}">
    <b id="r-${r.id}">Term ${r.term}: ${r.term_title} starts ${fmtDate(r.starts_on)}</b>
    <p>${r.program} · <span class="mono">${r.code}</span></p>
    <p class="small" style="margin-top:10px">Your seat is reserved. Lessons and live classes open here as soon as your enrollment for the term is confirmed.</p>
  </section>`)}</div>`;
}

function notEnrolledView(nextStart, reserved = []) {
  if (reserved.length) return reservedView(reserved);
  return html`<header class="band"><div><h1>Welcome to Nuvora</h1><p class="sub">You’re signed in, but not enrolled in a batch yet.</p></div></header>
  <div class="content"><section class="card empty">
    <b>You’re not enrolled in a batch yet</b>
    <p>New batches of every program start on the first Monday of each month.${nextStart ? html` The next one starts on <b>${fmtDate(nextStart)}</b>.` : ''}</p>
    <p class="row" style="justify-content:center;margin-top:14px"><a class="btn primary" href="/programs/">Explore programs</a><a class="btn ghost" href="/admissions/">How admission works</a></p>
    <p class="small" style="margin-top:14px">Already paid? Your batch appears here within a few minutes. If it doesn’t, reply to your payment email.</p>
  </section></div>`;
}

async function requireBatch(ctx) {
  const d = await ctx.dashboard();
  const b = ctx.batch();
  if (!b && !ctx.stale()) ctx.render(notEnrolledView(await rpc('next_start_date').catch(() => null), d.reserved));
  return b;
}

// ---------------------------------------------------------------- home
// The home page: learning path, next step, today's targets, streak, achievements, skill badges and the
// competency gaps for the student's goal. All of it comes from one database call, my_home().
//
// GUARDRAILS for everything on this page that recognises progress (the same list is at the top of
// supabase/migrations/20261002000007_learning_path.sql; keep the two in sync):
//   * Recognise only verified learning: watched video slices, completed lessons, graded projects, attended
//     live classes. Never sign-ins, clicks or time on a page. The database derives every number shown.
//   * No currencies to collect, no comparison tables, no public ordering of students: a student only
//     ever sees their own data.
//   * No loss-aversion wording ("don't lose your streak"). Streaks forgive single rest days and can be
//     switched off in Profile; when off, the server does not even send the number.
//   * Status is never shown by colour alone: every state has an icon and words.
//   * Never invent outcomes, reviews or statistics. Goals describe the skills a role uses, not a promised job.
//   * Motion is small (ring fill, badge pop) and off for anyone who prefers reduced motion.
const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
};
const percent = (n, total) => (total ? Math.round((100 * n) / total) : 0);
const ring = (value, label, cls = '') => html`<div class="ring ${cls}" role="img" aria-label="${label} ${value}% complete" style="--v:${value}"><b aria-hidden="true">${value}%</b></div>`;
const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayBefore = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return ymdLocal(new Date(y, m - 1, d - 1)); };

// The one main button of the page: where the next best action leads.
const NEXT = {
  resubmit: { tag: 'Revision requested', label: 'Revise and resubmit', href: () => '#/assignments' },
  overdue: { tag: 'Past its due date', label: 'Submit your work', href: () => '#/assignments' },
  session: { tag: 'Live class', label: 'Go to live classes', href: () => '#/live' },
  continue: { tag: 'Keep going', label: 'Continue the lesson', href: (n) => `#/lesson/${n.id}` },
  start: { tag: 'Next lesson', label: 'Start the lesson', href: (n) => `#/lesson/${n.id}` },
  due_soon: { tag: 'Due this week', label: 'Open the assignment', href: () => '#/assignments' },
  gap: { tag: 'For your goal', label: 'Open the lesson', href: (n) => `#/lesson/${n.id}` },
  caught_up: { tag: 'All caught up', label: 'Review your course', href: () => '#/course' },
};
const GAP = {
  mastered: ['checkc', 'Mastered', 'good'],
  needs_work: ['alert', 'Needs work', 'warn'],
  in_progress: ['half', 'In progress', 'info'],
  not_started: ['circle', 'Not started', ''],
  not_in_program: ['ext', 'Not in your program', ''],
};
const TERM_STATUS = {
  completed: ['checkc', 'Completed'],
  current: ['half', 'Current term'],
  reserved: ['calendar', 'Seat reserved'],
  upcoming: ['circle', 'Upcoming'],
};

function nextStepCard(h) {
  const n = h.next_action;
  const how = NEXT[n.kind] ?? NEXT.caught_up;
  const session = n.kind === 'session' ? h.batch.next_sessions.find((s) => s.id === n.id) : null;
  const join = session?.join_url && safeUrl(session.join_url);
  const when = n.starts_at ? ` Starts ${fmtDateTime(n.starts_at)}.` : n.due_at ? ` Due ${fmtDateTime(n.due_at)}.` : '';
  return html`<section class="card nextstep" aria-labelledby="h-next" data-home-card>
    <div class="cardhead"><h2 id="h-next">Your next step</h2><span class="pill info">${icon('target')} ${how.tag}</span></div>
    <p class="nexttitle">${n.title}</p>
    <p class="muted">${n.reason}${when}</p>
    <p class="row" style="margin-top:16px">${join
      ? html`<a class="btn gold" href="${join}" target="_blank" rel="noopener noreferrer" data-next="${n.kind}">${icon('live')} Join class</a>`
      : html`<a class="btn gold" href="${how.href(n)}" data-next="${n.kind}">${how.label} ${icon('next')}</a>`}</p>
  </section>`;
}

function pathCard(h) {
  const p = h.path;
  const b = h.batch;
  const all = percent(p.lessons_completed, p.lessons_total);
  const term = percent(b.lessons_completed, b.lessons_total);
  return html`<section class="card" aria-labelledby="h-path" data-home-card>
    <div class="cardhead"><h2 id="h-path">Your learning path</h2><a href="#/course">Open course →</a></div>
    <div class="rings">
      <figure class="ringfig">${ring(all, 'Learning path')}<figcaption><b>Learning path</b><span>${p.lessons_completed} of ${p.lessons_total} lessons in ${p.terms.length} ${p.terms.length === 1 ? 'term' : 'terms'}</span></figcaption></figure>
      <figure class="ringfig">${ring(term, `Term ${b.term}`, 'term')}<figcaption><b>Term ${b.term}: ${b.term_title}</b><span>${b.lessons_completed} of ${b.lessons_total} lessons</span></figcaption></figure>
    </div>
    <p class="goalline">${icon('route')}<span>Current goal: <b>${h.goal.title}</b>${h.goal.suggested ? html` <span class="muted">(suggested for your program)</span>` : ''} · <a href="#/profile">Change</a></span></p>
  </section>`;
}

function targetsCard(h) {
  const extra = (t) => (t.kind === 'session' ? ` · ${fmtTime(t.starts_at)}` : t.kind === 'assignment' ? ` · due ${fmtRelative(t.due_at)}` : t.percent ? ` · ${t.percent}% watched` : '');
  const href = (t) => (t.kind === 'lesson' ? `#/lesson/${t.id}` : t.kind === 'session' ? '#/live' : '#/assignments');
  return html`<section class="card" aria-labelledby="h-today" data-home-card>
    <div class="cardhead"><h2 id="h-today">Today’s targets</h2></div>
    ${h.targets.length ? html`<ul class="checklist">${h.targets.map((t) => html`
      <li class="${t.done ? 'done' : ''}"><span class="tick" aria-hidden="true">${icon(t.done ? 'checkc' : 'circle')}</span>
        <span class="meta"><a href="${href(t)}">${t.title}</a><small>${t.done ? 'Done' : 'To do'}${extra(t)}</small></span></li>`)}</ul>`
    : html`<p class="empty"><b>Nothing planned for today</b>Rest days are part of learning.</p>`}
  </section>`;
}

function streakCard(h) {
  const s = h.streak;
  if (!s) return '';
  const today = h.today;
  const last = s.last_active === today ? 'You learned today.' : s.last_active === dayBefore(today) ? 'You last learned yesterday.'
    : s.last_active ? `You last learned on ${fmtDate(s.last_active)}.` : 'No learning days recorded yet.';
  return html`<section class="card streak" aria-labelledby="h-streak" data-streak data-home-card>
    <div class="cardhead"><h2 id="h-streak">Learning streak</h2><a href="#/profile">Settings</a></div>
    <p class="streakline">${icon('flame')}${s.current ? html`<span><b>${s.current}-day</b> learning streak</span>` : html`<span>No streak running right now</span>`}</p>
    <p class="small muted">${last}${s.longest > s.current ? ` Your longest run: ${s.longest} days.` : ''}</p>
    <p class="small muted" style="margin-top:8px">Counts days with real learning: watching or finishing lessons, submitting projects, attending class. A single rest day never breaks it.</p>
  </section>`;
}

function achievementsCard(h) {
  return html`<section class="card" aria-labelledby="h-ach" data-home-card>
    <div class="cardhead"><h2 id="h-ach">Achievements</h2><span class="small muted">${h.achievements.filter((a) => a.earned).length} of ${h.achievements.length} earned</span></div>
    <ul class="achv">${h.achievements.map((a) => html`
      <li class="${a.earned ? 'earned' : 'locked'}"><span class="mark" aria-hidden="true">${icon(a.earned ? 'award' : 'lock')}</span>
        <span class="meta"><b>${a.title}</b><small>${a.earned ? `Earned ${fmtDate(a.earned_on)}` : 'Not yet earned'} · ${a.description}</small></span></li>`)}</ul>
  </section>`;
}

function badgesCard(h) {
  return html`<section class="card" aria-labelledby="h-badges" data-home-card>
    <div class="cardhead"><h2 id="h-badges">Skill badges</h2><span class="small muted">One for each term you master</span></div>
    <ul class="badges">${h.badges.map((b, i) => html`
      <li class="badge ${b.earned ? 'earned' : 'locked'}" title="${b.description}"><span class="medal" aria-hidden="true" style="animation-delay:${i * 60}ms">${icon(b.earned ? 'medal' : 'lock')}</span>
        <b>${b.title}</b><small>Term ${b.term} · ${b.earned ? 'Earned' : 'Locked'}</small></li>`)}</ul>
  </section>`;
}

function gapsCard(h) {
  const g = h.goal;
  const where = (s) => (s.status === 'not_in_program'
    ? html`Not taught in your program. Taught in ${s.programs.map((p) => p.name).join(', ')}.`
    : s.available ? html`<a href="#/lesson/${s.lesson_id}">Term ${s.term} · ${s.lesson_title}</a>` : html`Term ${s.term} · ${s.lesson_title}`);
  return html`<section class="card" aria-labelledby="h-gaps" data-home-card>
    <div class="cardhead"><div><h2 id="h-gaps">Skills for ${g.title}</h2>
      <p class="sub">${g.suggested ? 'A goal suggested for your program' : 'Your goal'} · <a href="#/profile">Change goal</a></p></div></div>
    <ul class="gaps">${g.skills.map((s) => {
      const [ic, label, tone] = GAP[s.status];
      return html`<li><span class="meta"><b>${s.skill}</b><small>${where(s)}</small></span><span class="pill ${tone}">${icon(ic)} ${label}</span></li>`;
    })}</ul>
    <p class="small muted" style="margin-top:12px">Skills that roles of this kind typically use. A goal guides what to practise; it is not a promise of a job.</p>
  </section>`;
}

function termsCard(h) {
  return html`<section class="card" aria-labelledby="h-terms" data-home-card>
    <div class="cardhead"><h2 id="h-terms">Term by term</h2><span class="small muted">${h.path.terms.length} ${h.path.terms.length === 1 ? 'term' : 'terms'} of 12 weeks</span></div>
    <ol class="terms">${h.path.terms.map((t) => {
      const [ic, label] = TERM_STATUS[t.status];
      const dates = t.starts_on ? ` · ${fmtDate(t.starts_on)}${t.ends_on && t.status !== 'reserved' ? ` – ${fmtDate(t.ends_on)}` : ''}` : '';
      return html`<li class="t-${t.status}"${t.status === 'current' ? ' aria-current="step"' : ''}><span class="mark" aria-hidden="true">${icon(ic)}</span>
        <span class="meta"><b>Term ${t.term}: ${t.title}</b><small>${label}${dates}${t.status === 'current' || t.status === 'completed' ? ` · ${t.lessons_completed}/${t.lessons_total} lessons` : ''}</small></span></li>`;
    })}</ol>
  </section>`;
}

export async function home(ctx) {
  const d = await ctx.dashboard(true);
  if (ctx.stale()) return;
  if (!d.batches.length) {
    const next = await rpc('next_start_date').catch(() => null);
    return ctx.render(notEnrolledView(next, d.reserved));
  }
  const h = await rpc('my_home', { p_batch: ctx.batch().id });
  if (ctx.stale()) return;
  const b = h.batch;
  const passed = b.assignments.filter((a) => a.status === 'graded').length;
  const open = b.next_sessions.find((s) => s.join_url);
  const next = b.next_sessions[0];
  const due = b.assignments.filter((a) => a.status !== 'graded').slice(0, 4);
  const termPct = percent(b.lessons_completed, b.lessons_total);

  ctx.render(html`
    <header class="band dark">
      <div><p class="eyebrow">${b.code} · Term ${b.term} of ${b.terms} · ${weekLabel(b)}</p>
        <h1>${greeting()}, <span class="serif">${firstName(h.profile.name, h.profile.email)}</span> <span class="wave" aria-hidden="true">👋</span></h1>
        <p class="sub">${b.program}</p></div>
      ${next ? html`<div aria-label="Time until your next live class"><p class="small" style="text-align:right">Next live class in</p><div class="count3" data-countdown="${next.starts_at}"></div></div>` : ''}
    </header>
    <div class="content">
      ${open ? html`<div class="announce" role="status"><span class="row">${icon('live')} ${open.title} is open now</span>${joinButton(open, 'btn ghost sm')}</div>` : ''}
      <div class="grid2">${nextStepCard(h)}${pathCard(h)}</div>
      <div class="grid3">${targetsCard(h)}${streakCard(h)}
        <section class="card" aria-labelledby="h-upcoming" data-home-card>
          <div class="cardhead"><h2 id="h-upcoming">Upcoming live classes</h2><a href="#/live">All classes →</a></div>
          ${b.next_sessions.length ? html`<div class="list">${b.next_sessions.map((s) => html`
            <div class="item">${dateBox(s.starts_at)}<div class="meta"><b>${s.title}</b><span>${fmtDateTime(s.starts_at)} – ${fmtTime(s.ends_at)}</span></div>${joinButton(s, 'btn ghost sm')}</div>`)}</div>`
          : html`<p class="empty">No more classes scheduled in this batch.</p>`}
        </section></div>
      <div class="grid2">
        <section class="card" aria-labelledby="h-progress" data-home-card>
          <div class="cardhead"><h2 id="h-progress">This term</h2><a href="#/course">Open course →</a></div>
          <div class="spread small muted" style="margin-bottom:8px"><span>${b.lessons_completed} of ${b.lessons_total} lessons complete</span><span>${termPct}%</span></div>
          ${progressBar(termPct, termPct === 100, 'Lessons completed this term')}
          <div class="tiles">
            <div class="tile"><b>${b.lessons_completed}<small>/${b.lessons_total}</small></b><span>Lessons</span></div>
            <div class="tile"><b>${b.attendance.attended}<small>/${b.attendance.held}</small></b><span>Classes attended</span></div>
            <div class="tile"><b>${passed}<small>/${b.assignments.length}</small></b><span>Projects passed</span></div>
            <div class="tile"><b>${b.recordings}</b><span>Recordings</span></div>
          </div>
        </section>
        ${termsCard(h)}
      </div>
      <div class="grid2 even">
        <section class="card" aria-labelledby="h-cw" data-home-card>
          <div class="cardhead"><h2 id="h-cw">Continue watching</h2><a href="#/course">All lessons →</a></div>
          ${h.continue_watching.length ? html`<div class="list">${h.continue_watching.map((c) => html`
            <a class="item" href="#/lesson/${c.lesson_id}" style="text-decoration:none;color:inherit">
              <div class="meta"><b>${c.title}</b><span>${c.code} · stopped at ${fmtClock(c.last_position)} of ${fmtClock(c.duration)}</span>${progressBar(c.percent ?? 0)}</div>
              <span class="btn ghost sm">${icon('play')} Resume</span></a>`)}</div>`
          : html`<p class="empty"><b>Nothing half-watched</b>Start your next lesson from the course page.</p>`}
        </section>
        <section class="card" aria-labelledby="h-due" data-home-card>
          <div class="cardhead"><h2 id="h-due">Assignments</h2><a href="#/assignments">All assignments →</a></div>
          ${due.length ? html`<div class="list">${due.map((a) => html`
            <div class="item"><div class="meta"><b>${a.title}</b><span>Due ${fmtDateTime(a.due_at)} · ${fmtRelative(a.due_at)}</span></div>${statusPill(a.status)}</div>`)}</div>`
          : html`<p class="empty"><b>Every assignment passed</b>Great work.</p>`}
        </section>
      </div>
      <div class="grid2 even">${achievementsCard(h)}${badgesCard(h)}</div>
      ${gapsCard(h)}
    </div>`);

  const el = $('[data-countdown]', ctx.main);
  if (el) {
    const tick = () => {
      const s = Math.max(0, (new Date(el.dataset.countdown).getTime() - Date.now()) / 1000);
      const parts = [[Math.floor(s / 86400), 'DAYS'], [Math.floor((s % 86400) / 3600), 'HRS'], [Math.floor((s % 3600) / 60), 'MIN']];
      el.innerHTML = String(html`${parts.map(([n, l]) => html`<span>${String(n).padStart(2, '0')}<small>${l}</small></span>`)}`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    ctx.onLeave(() => clearInterval(t));
  }
}

// ---------------------------------------------------------------- course
export async function course(ctx) {
  const b = await requireBatch(ctx);
  if (!b || ctx.stale()) return;
  const c = await rpc('my_course', { p_batch: b.id });
  if (ctx.stale()) return;
  // The batch's own term, plus earlier terms the student completed (kept for review).
  const termModules = c.modules.filter((m) => m.current);
  const all = termModules.flatMap((m) => m.lessons);
  const done = all.filter((l) => l.completed).length;
  const current = termModules.find((m) => m.lessons.some((l) => !l.completed)) ?? termModules[0];
  ctx.setTitle(c.batch.program);
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">${c.batch.code} · ${weekLabel(c.batch)}</p><h1>${c.batch.program}</h1>
      <p class="sub">Term ${c.batch.term} of ${c.batch.terms}: ${c.batch.term_title} · ${done} of ${all.length} lessons complete · lessons count as complete at 90% watched</p></div></header>
    <div class="content">
      ${c.modules.map((m) => {
        const mDone = m.lessons.filter((l) => l.completed).length;
        return html`<details class="mod"${m.id === current?.id ? ' open' : ''}>
          <summary><h2>Term ${m.term} · ${m.title}</h2><span class="row">${m.current ? '' : html`<span class="pill good">${icon('check')} Completed term</span>`}<span class="pill ${mDone === m.lessons.length ? 'good' : ''}">${mDone}/${m.lessons.length} complete</span><span class="chev">${icon('next')}</span></span></summary>
          <div class="lessons">${m.lessons.map((l) => html`
            <a class="lesson" href="#/lesson/${l.id}">
              <span class="st ${l.completed ? 'done' : l.percent > 0 ? 'prog' : ''}" aria-hidden="true">${icon(l.completed ? 'checkc' : l.percent > 0 ? 'half' : 'circle')}</span>
              <span><span class="title">${l.title}</span><br><span class="small muted">${l.code} · ${l.kind === 'reading' ? 'Reading' : fmtMinutes(l.duration)}${l.pdfs ? ` · ${l.pdfs} PDF${l.pdfs === 1 ? '' : 's'}` : ''}${l.completed ? ' · Completed' : l.percent > 0 ? ` · ${l.percent}% watched` : ''}</span></span>
              ${progressBar(l.percent, l.completed, `${l.title} progress`)}
              <span class="btn ghost sm">${l.completed ? 'Review' : l.percent > 0 ? 'Resume' : 'Start'}</span>
            </a>`)}</div>
        </details>`;
      })}
    </div>`);
}

// ---------------------------------------------------------------- lesson
export async function lesson(ctx) {
  const l = await rpc('my_lesson', { p_lesson: ctx.params.id });
  if (ctx.stale()) return;
  ctx.setTitle(l.title);
  const resumeAt = !l.completed && l.last_position > 5 && l.last_position < l.duration - 5 ? l.last_position : 0;
  ctx.render(html`
    <header class="band"><div><p class="eyebrow"><a href="#/course">My course</a> · Term ${l.term.no}: ${l.term.title}</p><h1>${l.title}</h1>
      <p class="sub">${l.code} · Lesson ${l.index} of ${l.total} · ${l.kind === 'reading' ? 'Reading' : fmtMinutes(l.duration)}</p></div></header>
    <div class="content">
      ${l.can_track ? '' : html`<p class="okmsg" role="note">Preview mode: staff viewing isn’t recorded as progress.</p>`}
      <section class="card">
        ${l.kind === 'reading'
          ? html`<div class="stack"><p>This reading opens in your course materials. When you’ve finished it, mark it as done.</p>
              <p><button class="btn primary" type="button" data-reading ${l.completed || !l.can_track ? 'disabled' : ''}>${l.completed ? 'Completed' : 'Mark as done'}</button></p></div>`
          : html`<div data-player></div>
              <div class="watchinfo">
                <span data-status>${l.completed ? html`<span class="pill good">${icon('check')} Completed</span>` : html`Watched <b data-pct>${l.percent}</b>% · complete at 90%`}</span>
                <span data-bar>${progressBar(l.percent, l.completed, 'Watched')}</span>
                ${resumeAt ? html`<span class="small">Resuming at ${fmtClock(resumeAt)}</span>` : ''}
              </div>
              <p class="err" role="alert" data-saveerr hidden>We couldn’t save your last few seconds of progress. Keep watching and we’ll try again.</p>`}
      </section>
      ${l.materials.length ? html`<section class="card assign" aria-labelledby="h-mat"><div><h2 id="h-mat">Lesson materials</h2>
        <p class="sub">PDFs can be downloaded. Videos stream only inside the portal.</p></div>${materialsList(l.materials, `${l.materials.length} PDF${l.materials.length === 1 ? '' : 's'}`)}</section>` : ''}
      <nav class="spread" aria-label="Lesson navigation">
        ${l.prev ? html`<a class="btn ghost" href="#/lesson/${l.prev.id}">${icon('prev')} ${l.prev.title}</a>` : html`<span></span>`}
        ${l.next ? html`<a class="btn primary" href="#/lesson/${l.next.id}">${l.next.title} ${icon('next')}</a>` : html`<a class="btn ghost" href="#/course">Back to course</a>`}
      </nav>
    </div>`);

  wireDownloads(ctx.main);
  if (l.kind === 'reading') {
    $('[data-reading]', ctx.main)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await rpc('mark_reading_done', { p_lesson: l.id }); e.target.textContent = 'Completed'; ctx.invalidate(); toast('Reading marked as done.'); }
      catch (err) { e.target.disabled = false; toast(err.message); }
    });
    return;
  }

  const player = new DemoPlayer($('[data-player]', ctx.main), {
    duration: l.duration, title: l.title, eyebrow: `${l.code} · Term ${l.term.no}`,
    start: resumeAt, watermark: ctx.me?.email ?? '',
  });
  let tracker = null;
  if (l.can_track) {
    let wasComplete = l.completed;
    tracker = new WatchTracker(player, {
      send: (from, to, position) => rpc('record_progress', { p_lesson: l.id, p_from: from, p_to: to, p_position: position }),
      sendOnUnload: (from, to, position) => rpcOnUnload('record_progress', { p_lesson: l.id, p_from: from, p_to: to, p_position: position }),
    });
    tracker.addEventListener('progress', (e) => {
      const r = e.detail;
      ctx.invalidate();
      $('[data-saveerr]', ctx.main)?.setAttribute('hidden', '');
      const bar = $('[data-bar]', ctx.main);
      if (bar) bar.innerHTML = String(progressBar(r.percent, r.completed, 'Watched'));
      const status = $('[data-status]', ctx.main);
      if (status) status.innerHTML = String(r.completed ? html`<span class="pill good">${icon('check')} Completed</span>` : html`Watched <b data-pct>${r.percent}</b>% · complete at 90%`);
      if (r.completed && !wasComplete) { wasComplete = true; toast('Lesson complete. Nice work!'); }
    });
    tracker.addEventListener('error', () => $('[data-saveerr]', ctx.main)?.removeAttribute('hidden'));
  }
  ctx.onLeave(() => { tracker?.destroy(); player.destroy(); });
}

// ---------------------------------------------------------------- live classes
export async function live(ctx) {
  const b = await requireBatch(ctx);
  if (!b || ctx.stale()) return;
  const sessions = await rpc('my_sessions', { p_batch: b.id });
  if (ctx.stale()) return;
  const tab = ctx.query.get('tab') === 'past' ? 'past' : 'upcoming';
  const upcoming = sessions.filter((s) => s.phase === 'upcoming' || s.phase === 'live' || (s.phase === 'cancelled' && new Date(s.ends_at) > new Date()));
  const past = sessions.filter((s) => s.phase === 'ended').reverse();
  const list = tab === 'past' ? past : upcoming;

  ctx.render(html`
    <header class="band"><div><p class="eyebrow">${b.code}</p><h1>Live classes</h1>
      <p class="sub">Times are in your time zone (${localZone()}). Join links open 15 minutes before each class.</p></div>
      <div class="seg" role="tablist" aria-label="Classes">
        <button type="button" role="tab" aria-selected="${tab === 'upcoming'}" data-tab="upcoming">Upcoming (${upcoming.length})</button>
        <button type="button" role="tab" aria-selected="${tab === 'past'}" data-tab="past">Past (${past.length})</button>
      </div></header>
    <div class="content"><section class="card" role="tabpanel" aria-label="${tab === 'past' ? 'Past classes' : 'Upcoming classes'}">
      ${list.length ? html`<div class="list">${list.map((s) => html`
        <div class="item" data-session="${s.id}">
          ${dateBox(s.starts_at)}
          <div class="meta"><b>${s.title}</b><span>${fmtDateTime(s.starts_at)} – ${fmtTime(s.ends_at)}</span></div>
          ${tab === 'past'
            ? html`<span class="row">${s.attended_minutes ? html`<span class="pill good">Attended · ${s.attended_minutes} min</span>` : html`<span class="pill bad">Missed</span>`}
                ${s.has_recording ? html`<a class="btn ghost sm" href="#/recording/${s.id}">${icon('rec')} Watch recording</a>` : html`<span class="small muted">Recording not ready yet</span>`}</span>`
            : s.phase === 'cancelled' ? html`<span class="pill bad">Cancelled</span>`
            : html`<span class="row">${s.phase === 'live' ? html`<span class="pill live"><i></i> Live now</span>` : html`<span class="small muted">${fmtRelative(s.starts_at)}</span>`}${joinButton(s)}</span>`}
        </div>`)}</div>`
      : html`<p class="empty"><b>${tab === 'past' ? 'No classes yet' : 'No upcoming classes'}</b>${tab === 'past' ? 'Past classes and their recordings will appear here.' : 'This batch has no more classes scheduled.'}</p>`}
    </section></div>`);

  for (const t of $$('[data-tab]', ctx.main)) {
    t.addEventListener('click', () => ctx.go(t.dataset.tab === 'past' ? '#/live?tab=past' : '#/live'));
  }
  // Keep the upcoming list current so the Join button appears on time.
  if (tab === 'upcoming') {
    const t = setInterval(() => ctx.refresh(), 60_000);
    ctx.onLeave(() => clearInterval(t));
  }
}

// ---------------------------------------------------------------- recording
export async function recording(ctx) {
  const b = await requireBatch(ctx);
  if (!b || ctx.stale()) return;
  const s = (await rpc('my_sessions', { p_batch: b.id })).find((x) => x.id === ctx.params.id && x.has_recording);
  if (ctx.stale()) return;
  if (!s) throw notFound();
  ctx.setTitle(`Recording: ${s.title}`);
  ctx.render(html`
    <header class="band"><div><p class="eyebrow"><a href="#/live?tab=past">Live classes</a> · Recording</p><h1>${s.title}</h1>
      <p class="sub">Recorded ${fmtDateTime(s.starts_at)}</p></div></header>
    <div class="content"><section class="card"><div data-player></div>
      <p class="small muted" style="margin-top:12px">${icon('lock')} Recordings play only inside the portal and can’t be downloaded.</p></section>
      <p><a class="btn ghost" href="#/live?tab=past">${icon('prev')} Back to past classes</a></p></div>`);
  const seconds = (new Date(s.ends_at) - new Date(s.starts_at)) / 1000;
  const player = new DemoPlayer($('[data-player]', ctx.main), { duration: seconds, title: s.title, eyebrow: `${b.code} · Recording`, watermark: ctx.me?.email ?? '' });
  ctx.onLeave(() => player.destroy());
}

// ---------------------------------------------------------------- assignments
const RUBRIC_HELP = html`<details class="small muted"><summary>How grading works</summary>
  <p style="margin-top:8px">Every project is graded on four levels. <b>Distinguished</b> and <b>Proficient</b> pass. <b>Basic</b> and <b>Not yet</b> come with feedback and you resubmit; there’s no penalty for resubmitting.</p></details>`;

export async function assignments(ctx) {
  const b = await requireBatch(ctx);
  if (!b || ctx.stale()) return;
  const list = await rpc('my_assignments', { p_batch: b.id });
  if (ctx.stale()) return;
  const passed = list.filter((a) => a.status === 'graded').length;
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">${b.code}</p><h1>Assignments</h1><p class="sub">${passed} of ${list.length} passed</p></div></header>
    <div class="content">
      ${RUBRIC_HELP}
      ${list.map((a) => {
        const s = a.submission;
        const link = s?.link_url && safeUrl(s.link_url);
        const label = a.status === 'needs_resubmission' ? 'Resubmit' : a.status === 'submitted' ? 'Update submission' : 'Submit';
        return html`<section class="card assign" id="a-${a.id}" aria-labelledby="t-${a.id}">
          <div class="spread"><div><h2 id="t-${a.id}">${a.title}</h2><p class="small muted">Due ${fmtDateTime(a.due_at)} · ${fmtRelative(a.due_at)}</p></div>${statusPill(a.status)}</div>
          ${a.instructions ? html`<p>${a.instructions}</p>` : ''}
          ${materialsList(a.materials, 'Assessment files')}
          ${s ? html`<div class="box"><h3>Your submission · attempt ${s.attempt}</h3>
              ${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer nofollow">${s.link_url} ${icon('ext')}</a>` : ''}
              ${s.note ? html`<p class="muted">“${s.note}”</p>` : ''}
              <span class="small muted">Submitted ${fmtDateTime(s.submitted_at)}${s.late ? html` · <span class="pill warn">Late</span>` : ''}</span></div>` : ''}
          ${s?.grade && a.status !== 'submitted' ? html`<div class="box feedback ${s.grade}"><h3>Feedback · ${GRADE_LABEL[s.grade]}</h3>${s.feedback ? html`<p>${s.feedback}</p>` : ''}</div>` : ''}
          ${a.status === 'submitted' && s?.attempt > 1 && s.feedback ? html`<div class="box feedback"><h3>Feedback on your previous attempt</h3><p>${s.feedback}</p></div>` : ''}
          ${a.status === 'graded' ? '' : html`<form class="stack" novalidate data-submit="${a.id}">
            <p class="formerr" role="alert" hidden></p>
            <div class="field"><label for="l-${a.id}">Link to your work</label>
              <input id="l-${a.id}" type="url" inputmode="url" placeholder="https://github.com/you/project" maxlength="500" value="${s?.link_url ?? ''}" required>
              <span class="hint">GitHub, Google Colab, Kaggle or a shared document. Must start with https://</span></div>
            <div class="field"><label for="n-${a.id}">Note for your instructor <span class="muted">(optional)</span></label>
              <textarea id="n-${a.id}" maxlength="2000"></textarea></div>
            <p><button class="btn primary" type="submit">${label}</button></p>
          </form>`}
        </section>`;
      })}
    </div>`);

  wireDownloads(ctx.main);
  for (const form of $$('[data-submit]', ctx.main)) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.submit;
      const err = $('.formerr', form);
      const link = $(`#l-${id}`, form).value.trim();
      const note = $(`#n-${id}`, form).value.trim();
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (!/^https:\/\/\S+\.\S+/.test(link) || !safeUrl(link)) return fail('Add a link that starts with https://');
      err.hidden = true;
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        await rpc('submit_assignment', { p_assignment: id, p_link: link, p_note: note || null });
        ctx.invalidate();
        toast('Submitted. Your instructor will review it soon.');
        await ctx.refresh();
      } catch (ex) {
        btn.disabled = false;
        fail(ex.message);
      }
    });
  }
}

// ---------------------------------------------------------------- notifications
const KIND_TARGET = { welcome: '#/home', graded: '#/assignments', recording: '#/live?tab=past', achievement: '#/home', badge: '#/home', term_reserved: '#/home' };
export async function notifications(ctx) {
  const n = await rpc('my_notifications', { p_limit: 50 });
  if (ctx.stale()) return;
  ctx.setUnread(n.unread);
  ctx.render(html`
    <header class="band"><div><h1>Notifications</h1><p class="sub">${n.unread ? `${n.unread} unread` : 'You’re up to date'}</p></div>
      ${n.unread ? html`<button class="btn ghost" type="button" data-readall>${icon('check')} Mark all as read</button>` : ''}</header>
    <div class="content"><section class="card">
      ${n.items.length ? html`<div class="list" style="gap:0">${n.items.map((x) => html`
        <button type="button" class="note${x.read ? '' : ' unread'}" data-note="${x.id}" data-kind="${x.kind}" data-read="${x.read}">
          <span class="dot" aria-hidden="true"></span>
          <span style="flex:1;min-width:0"><b>${x.title}${x.read ? '' : html`<span class="sr"> (unread)</span>`}</b><span>${x.body}</span><br><span>${fmtRelative(x.created_at)}</span></span>
        </button>`)}</div>`
      : html`<p class="empty"><b>No notifications yet</b>Class reminders, new recordings and feedback will appear here.</p>`}
    </section></div>`);

  $('[data-readall]', ctx.main)?.addEventListener('click', async () => {
    await rpc('mark_notifications_read');
    ctx.setUnread(0);
    ctx.invalidate();
    await ctx.refresh();
  });
  for (const el of $$('[data-note]', ctx.main)) {
    el.addEventListener('click', async () => {
      if (el.dataset.read === 'false') {
        try { await rpc('mark_notifications_read', { p_id: el.dataset.note }); ctx.setUnread(n.unread - 1); ctx.invalidate(); } catch { /* still navigate */ }
      }
      const isStaff = ['instructor', 'admin'].includes(ctx.me?.role);
      const target = isStaff ? null : KIND_TARGET[el.dataset.kind] ?? (el.dataset.kind.startsWith('reminder') ? '#/live' : null);
      if (target) ctx.go(target); else ctx.refresh();
    });
  }
}

// ---------------------------------------------------------------- profile
export async function profile(ctx) {
  const d = await ctx.dashboard();
  if (ctx.stale()) return;
  const me = d.profile;
  // Goal and streak settings belong to a student's learning, so they appear once there is a batch.
  const b = ['instructor', 'admin'].includes(me.role) ? null : ctx.batch();
  const h = b ? await rpc('my_home', { p_batch: b.id }) : null;
  if (ctx.stale()) return;
  ctx.render(html`
    <header class="band"><div><h1>Your profile</h1><p class="sub">${me.email}</p></div></header>
    <div class="content"><div class="grid2 even">
      <section class="card"><h2>Personal details</h2>
        <form class="stack" novalidate data-form="name" style="margin-top:14px">
          <p class="formerr" role="alert" hidden></p>
          <div class="field"><label for="fullname">Full name</label><input id="fullname" type="text" autocomplete="name" maxlength="80" value="${me.name}"><span class="hint">Shown to your instructors.</span></div>
          <div class="field"><label for="em">Email address</label><input id="em" type="email" value="${me.email}" readonly aria-describedby="em-hint"><span class="hint" id="em-hint">To change your email, contact support.</span></div>
          <p><button class="btn primary" type="submit">Save name</button></p>
        </form></section>
      <section class="card"><h2>Password</h2>
        <form class="stack" novalidate data-form="password" style="margin-top:14px">
          <p class="formerr" role="alert" hidden></p>
          <div class="field"><label for="np">New password</label><input id="np" type="password" autocomplete="new-password" minlength="8"><span class="hint">At least 8 characters.</span></div>
          <div class="field"><label for="cp">Confirm new password</label><input id="cp" type="password" autocomplete="new-password"></div>
          <p><button class="btn primary" type="submit">Change password</button></p>
        </form></section>
    </div>
    ${h ? learningSettings(h) : ''}
    <section class="card spread"><div><h2>Sign out</h2><p class="sub">Sign out of Nuvora on this device.</p></div><button class="btn ghost" type="button" data-signout-page>${icon('logout')} Sign out</button></section>
    </div>`);

  const nameForm = $('[data-form="name"]', ctx.main);
  nameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.formerr', nameForm);
    try {
      const r = await rpc('update_my_profile', { p_full_name: $('#fullname', nameForm).value });
      err.hidden = true;
      $('#fullname', nameForm).value = r.name;
      ctx.updateName(r.name);
      ctx.invalidate();
      toast('Name saved.');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  const pwForm = $('[data-form="password"]', ctx.main);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.formerr', pwForm);
    const np = $('#np', pwForm).value;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (np.length < 8) return fail('Choose a password of at least 8 characters.');
    if (np !== $('#cp', pwForm).value) return fail('The two passwords don’t match.');
    try {
      await auth.updatePassword(np);
      err.hidden = true;
      pwForm.reset();
      toast('Password changed.');
    } catch (ex) { fail(ex.message); }
  });

  $('[data-signout-page]', ctx.main).addEventListener('click', () => ctx.signOut());
  if (h) wireLearningSettings(ctx);
}

// Career goal (it shapes the skills card on the home page) and the streak switch.
function learningSettings(h) {
  const suggested = h.roles.find((r) => r.for_program);
  const option = (r) => html`<option value="${r.id}"${h.profile.goal_role === r.id ? ' selected' : ''}>${r.title}</option>`;
  return html`<section class="card" aria-labelledby="h-learning"><h2 id="h-learning">Your goal and streak</h2>
    <div class="grid2 even" style="margin-top:14px">
      <form class="stack" novalidate data-form="goal">
        <p class="formerr" role="alert" hidden></p>
        <div class="field"><label for="goal">Career goal</label>
          <select id="goal" aria-describedby="goal-hint">
            <option value=""${h.profile.goal_role ? '' : ' selected'}>Suggested for my program${suggested ? ` (${suggested.title})` : ''}</option>
            <optgroup label="Roles your program prepares for">${h.roles.filter((r) => r.for_program).map(option)}</optgroup>
            <optgroup label="Other roles">${h.roles.filter((r) => !r.for_program).map(option)}</optgroup>
          </select>
          <span class="hint" id="goal-hint">Your home page lists the skills this role typically uses and where your program teaches them. It is a direction for practice, not a promise of a job.</span></div>
        <p><button class="btn primary" type="submit">Save goal</button></p>
      </form>
      <div class="stack" style="align-content:start">
        <label class="switch" for="streak"><input id="streak" type="checkbox" role="switch"${h.profile.show_streak ? ' checked' : ''}><span>Show my learning streak</span></label>
        <span class="hint">It counts days with real learning. When it’s off, no streak is shown anywhere. It never affects your grades.</span>
      </div>
    </div></section>`;
}

function wireLearningSettings(ctx) {
  const goalForm = $('[data-form="goal"]', ctx.main);
  goalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.formerr', goalForm);
    try {
      const r = await rpc('set_my_goal', { p_role: $('#goal', goalForm).value || null });
      err.hidden = true;
      toast(r.title ? `Goal saved: ${r.title}.` : 'Goal set back to the suggestion for your program.');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  const sw = $('#streak', ctx.main);
  sw.addEventListener('change', async () => {
    sw.disabled = true;
    try {
      await rpc('set_streak_visibility', { p_on: sw.checked });
      toast(sw.checked ? 'Your streak is shown on your home page.' : 'Your streak is hidden.');
    } catch (ex) { sw.checked = !sw.checked; toast(ex.message); } finally { sw.disabled = false; }
  });
}
