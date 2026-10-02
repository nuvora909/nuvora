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

function notEnrolledView(nextStart) {
  return html`<header class="band"><div><h1>Welcome to Nuvora</h1><p class="sub">You’re signed in, but not enrolled in a batch yet.</p></div></header>
  <div class="content"><section class="card empty">
    <b>You’re not enrolled in a batch yet</b>
    <p>New batches of every program start on the first Monday of each month.${nextStart ? html` The next one starts on <b>${fmtDate(nextStart)}</b>.` : ''}</p>
    <p class="row" style="justify-content:center;margin-top:14px"><a class="btn primary" href="/#programs">Explore programs</a><a class="btn ghost" href="/#admissions">How admission works</a></p>
    <p class="small" style="margin-top:14px">Already paid? Your batch appears here within a few minutes. If it doesn’t, reply to your payment email.</p>
  </section></div>`;
}

async function requireBatch(ctx) {
  await ctx.dashboard();
  const b = ctx.batch();
  if (!b && !ctx.stale()) ctx.render(notEnrolledView(await rpc('next_start_date').catch(() => null)));
  return b;
}

// ---------------------------------------------------------------- home
export async function home(ctx) {
  const d = await ctx.dashboard(true);
  if (ctx.stale()) return;
  if (!d.batches.length) {
    const next = await rpc('next_start_date').catch(() => null);
    return ctx.render(notEnrolledView(next));
  }
  const b = ctx.batch();
  const pct = b.lessons_total ? Math.round((100 * b.lessons_completed) / b.lessons_total) : 0;
  const passed = b.assignments.filter((a) => a.status === 'graded').length;
  const open = b.next_sessions.find((s) => s.join_url);
  const next = b.next_sessions[0];
  const due = b.assignments.filter((a) => a.status !== 'graded').slice(0, 4);

  ctx.render(html`
    <header class="band">
      <div><p class="eyebrow">${b.code} · ${weekLabel(b)}</p><h1>Welcome back, ${firstName(d.profile.name, d.profile.email)}</h1><p class="sub">${b.program}</p></div>
      ${next ? html`<div aria-label="Time until your next live class"><p class="small muted" style="text-align:right">Next live class in</p><div class="count3" data-countdown="${next.starts_at}"></div></div>` : ''}
    </header>
    <div class="content">
      ${open ? html`<div class="announce" role="status"><span class="row">${icon('live')} ${open.title} is open now</span>${joinButton(open, 'btn gold sm')}</div>` : ''}
      <div class="grid2">
        <section class="card" aria-labelledby="h-progress">
          <div class="cardhead"><h2 id="h-progress">Your progress</h2><a href="#/course">Open course →</a></div>
          <div class="spread small muted" style="margin-bottom:8px"><span>${b.lessons_completed} of ${b.lessons_total} lessons complete</span><span>${pct}%</span></div>
          ${progressBar(pct, pct === 100, 'Lessons completed')}
          <div class="tiles">
            <div class="tile"><b>${b.lessons_completed}<small>/${b.lessons_total}</small></b><span>Lessons</span></div>
            <div class="tile"><b>${b.attendance.attended}<small>/${b.attendance.held}</small></b><span>Classes attended</span></div>
            <div class="tile"><b>${passed}<small>/${b.assignments.length}</small></b><span>Projects passed</span></div>
            <div class="tile"><b>${b.recordings}</b><span>Recordings</span></div>
          </div>
        </section>
        <section class="card" aria-labelledby="h-upcoming">
          <div class="cardhead"><h2 id="h-upcoming">Upcoming live classes</h2><a href="#/live">All classes →</a></div>
          ${b.next_sessions.length ? html`<div class="list">${b.next_sessions.map((s) => html`
            <div class="item">${dateBox(s.starts_at)}<div class="meta"><b>${s.title}</b><span>${fmtDateTime(s.starts_at)} – ${fmtTime(s.ends_at)}</span></div>${joinButton(s)}</div>`)}</div>`
          : html`<p class="empty">No more classes scheduled in this batch.</p>`}
        </section>
      </div>
      <div class="grid2 even">
        <section class="card" aria-labelledby="h-cw">
          <div class="cardhead"><h2 id="h-cw">Continue watching</h2><a href="#/course">All lessons →</a></div>
          ${d.continue_watching.length ? html`<div class="list">${d.continue_watching.slice(0, 4).map((c) => html`
            <a class="item" href="#/lesson/${c.lesson_id}" style="text-decoration:none;color:inherit">
              <div class="meta"><b>${c.title}</b><span>${c.code} · stopped at ${fmtClock(c.last_position)} of ${fmtClock(c.duration)}</span>${progressBar(c.percent ?? 0)}</div>
              <span class="btn ghost sm">${icon('play')} Resume</span></a>`)}</div>`
          : html`<p class="empty"><b>You’re all caught up</b>Start your next lesson from the course page.</p>`}
        </section>
        <section class="card" aria-labelledby="h-due">
          <div class="cardhead"><h2 id="h-due">Assignments</h2><a href="#/assignments">All assignments →</a></div>
          ${due.length ? html`<div class="list">${due.map((a) => html`
            <div class="item"><div class="meta"><b>${a.title}</b><span>Due ${fmtDateTime(a.due_at)} · ${fmtRelative(a.due_at)}</span></div>${statusPill(a.status)}</div>`)}</div>`
          : html`<p class="empty"><b>Every assignment passed</b>Great work.</p>`}
        </section>
      </div>
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
  const all = c.modules.flatMap((m) => m.lessons);
  const done = all.filter((l) => l.completed).length;
  const current = c.modules.find((m) => m.lessons.some((l) => !l.completed)) ?? c.modules[0];
  ctx.setTitle(c.batch.program);
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">${c.batch.code} · ${weekLabel(c.batch)}</p><h1>${c.batch.program}</h1>
      <p class="sub">${done} of ${all.length} lessons complete · lessons count as complete at 90% watched</p></div></header>
    <div class="content">
      ${c.modules.map((m) => {
        const mDone = m.lessons.filter((l) => l.completed).length;
        return html`<details class="mod"${m.id === current?.id ? ' open' : ''}>
          <summary><h2>Module ${m.position} · ${m.title}</h2><span class="row"><span class="pill ${mDone === m.lessons.length ? 'good' : ''}">${mDone}/${m.lessons.length} complete</span><span class="chev">${icon('next')}</span></span></summary>
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
    <header class="band"><div><p class="eyebrow"><a href="#/course">My course</a> · Module ${l.module.position}: ${l.module.title}</p><h1>${l.title}</h1>
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
    duration: l.duration, title: l.title, eyebrow: `${l.code} · Module ${l.module.position}`,
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
const KIND_TARGET = { welcome: '#/home', graded: '#/assignments', recording: '#/live?tab=past' };
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
  ctx.render(html`
    <header class="band"><div><h1>Your profile</h1><p class="sub">${me.email}</p></div></header>
    <div class="content"><div class="grid2 even">
      <section class="card"><h2>Personal details</h2>
        <form class="stack" novalidate data-form="name" style="margin-top:14px">
          <p class="formerr" role="alert" hidden></p>
          <div class="field"><label for="fullname">Full name</label><input id="fullname" type="text" autocomplete="name" maxlength="80" value="${me.name}"><span class="hint">Shown to your instructors and on your certificate.</span></div>
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
}
