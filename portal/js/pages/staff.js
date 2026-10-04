// Staff pages: teaching overview, grading queue and batch roster.
// Instructors see only the batches they teach; admins see all. The database enforces this on every call.
import { rpc } from '../api.js';
import { html, icon, toast, busy, $, $$, safeUrl, progressBar, GRADE_LABEL, fmtDate, fmtDateTime, fmtRelative } from '../ui.js';

const RUBRIC = [
  ['distinguished', 'Exceeds every requirement; could serve as an example.'],
  ['proficient', 'Meets every requirement. Passes.'],
  ['basic', 'Partly there. Student resubmits with your feedback.'],
  ['not_yet', 'Doesn’t meet the requirements yet. Student resubmits.'],
];
const AT_RISK_DAYS = 14;
const activity = (days) => (days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`);

// ---------------------------------------------------------------- overview
export async function teach(ctx) {
  const [batches, atRisk] = await Promise.all([rpc('staff_overview'), rpc('staff_at_risk', { p_days: AT_RISK_DAYS })]);
  if (ctx.stale()) return;
  const toGrade = batches.reduce((n, b) => n + b.to_grade, 0);
  ctx.setToGrade(toGrade);
  const isAdmin = ctx.me?.role === 'admin';
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">${isAdmin ? 'Admin · all batches' : 'Instructor'}</p><h1>Teaching</h1>
      <p class="sub">${batches.length} ${batches.length === 1 ? 'batch' : 'batches'} · ${toGrade} ${toGrade === 1 ? 'submission' : 'submissions'} waiting for a grade</p></div>
      ${toGrade ? html`<a class="btn primary" href="#/grading">${icon('grade')} Start grading</a>` : ''}</header>
    <div class="content">
      ${batches.length ? html`<div class="grid2 even">${batches.map((b) => html`
        <section class="card" aria-labelledby="b-${b.id}">
          <div class="spread"><div><h2 id="b-${b.id}">${b.code}</h2><p class="sub">${b.program}<br>Term ${b.term}: ${b.term_title}</p></div>
            <span class="pill ${b.status === 'active' ? 'good' : 'info'}">${b.week ? `Week ${b.week} of ${b.weeks}` : `Starts ${fmtDate(b.starts_on)}`}</span></div>
          <div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <div class="tile"><b>${b.students}</b><span>Students</span></div>
            <div class="tile"><b>${b.to_grade}</b><span>To grade</span></div>
          </div>
          ${b.next_session ? html`<div class="item" style="margin-top:14px"><div class="meta"><b>Next: ${b.next_session.title}</b><span>${fmtDateTime(b.next_session.starts_at)} · ${fmtRelative(b.next_session.starts_at)}</span></div>
            ${b.next_session.join_url && safeUrl(b.next_session.join_url) ? html`<a class="btn primary sm" href="${safeUrl(b.next_session.join_url)}" target="_blank" rel="noopener noreferrer">Open class</a>` : ''}</div>` : ''}
          <p class="row" style="margin-top:16px"><a class="btn ghost sm" href="#/roster/${b.id}">${icon('users')} Roster</a>
            <a class="btn ghost sm" href="#/grading?batch=${b.id}">${icon('grade')} Grade (${b.to_grade})</a></p>
        </section>`)}</div>`
      : html`<section class="card empty"><b>No batches assigned yet</b>An admin will assign you to a batch before it starts.</section>`}
      <section class="card" aria-labelledby="h-risk">
        <div class="cardhead"><div><h2 id="h-risk">Students who may need a nudge</h2><p class="sub">No learning activity for ${AT_RISK_DAYS}+ days</p></div></div>
        ${atRisk.length ? html`<div class="tablewrap"><table class="data"><thead><tr><th>Student</th><th>Batch</th><th>Last active</th></tr></thead><tbody>
          ${atRisk.map((s) => html`<tr><td><b>${s.full_name || s.email}</b><br><span class="small muted">${s.email}</span></td><td class="mono">${s.batch_code}</td>
            <td><span class="pill warn">${activity(s.days_inactive)}</span></td></tr>`)}</tbody></table></div>`
        : html`<p class="empty">Everyone has been active in the last ${AT_RISK_DAYS} days.</p>`}
      </section>
    </div>`);
}

// ---------------------------------------------------------------- grading queue
export async function grading(ctx) {
  const batch = ctx.query.get('batch');
  const queue = await rpc('staff_grading_queue', batch ? { p_batch: batch } : {});
  if (ctx.stale()) return;
  if (!batch) ctx.setToGrade(queue.length);
  let remaining = queue.length;
  const subtitle = () => (remaining ? `${remaining} ${remaining === 1 ? 'submission' : 'submissions'} waiting, oldest first` : 'All caught up');

  ctx.render(html`
    <header class="band"><div><p class="eyebrow">${batch ? 'One batch' : 'All your batches'}</p><h1>Grading</h1><p class="sub" data-sub>${subtitle()}</p></div>
      ${batch ? html`<a class="btn ghost" href="#/grading">Show all batches</a>` : ''}</header>
    <div class="content" data-queue>
      ${queue.length ? queue.map((s) => {
        const link = s.link_url && safeUrl(s.link_url);
        return html`<section class="card assign" id="s-${s.id}" aria-labelledby="g-${s.id}">
          <div class="spread"><div><h2 id="g-${s.id}">${s.assignment.title}</h2>
            <p class="small muted">${s.student.name || s.student.email} · ${s.student.email} · <span class="mono">${s.batch.code}</span></p></div>
            <span class="row"><span class="pill info">Attempt ${s.attempt}</span>${s.late ? html`<span class="pill warn">Late</span>` : ''}</span></div>
          <div class="box"><h3>Submission</h3>
            ${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer nofollow">${s.link_url} ${icon('ext')}</a>` : html`<span class="muted">No link</span>`}
            ${s.note ? html`<p class="muted">“${s.note}”</p>` : ''}
            <span class="small muted">Submitted ${fmtDateTime(s.submitted_at)} · due ${fmtDateTime(s.assignment.due_at)}</span></div>
          ${s.previous_feedback ? html`<div class="box feedback"><h3>Your feedback on the previous attempt</h3><p>${s.previous_feedback}</p></div>` : ''}
          <form class="stack" novalidate data-grade="${s.id}">
            <p class="formerr" role="alert" hidden></p>
            <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:600;margin-bottom:8px">Grade</legend>
              <div class="rubric">${RUBRIC.map(([g, help]) => html`<label><input type="radio" name="grade-${s.id}" value="${g}"><b>${GRADE_LABEL[g]}</b>${help}</label>`)}</div></fieldset>
            <div class="field"><label for="f-${s.id}">Feedback for ${s.student.name || 'the student'}</label>
              <textarea id="f-${s.id}" maxlength="5000" placeholder="What worked, and what to improve"></textarea>
              <span class="hint">Required for Basic and Not yet, so the student knows what to change.</span></div>
            <p><button class="btn primary" type="submit">Submit grade</button></p>
          </form>
        </section>`;
      }) : html`<section class="card empty"><b>Nothing to grade</b>New submissions will appear here.</section>`}
    </div>`);

  for (const form of $$('[data-grade]', ctx.main)) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.grade;
      const err = $('.formerr', form);
      const grade = $(`input[name="grade-${id}"]:checked`, form)?.value;
      const feedback = $(`#f-${id}`, form).value.trim();
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (!grade) return fail('Choose a grade.');
      if ((grade === 'basic' || grade === 'not_yet') && feedback.length < 10) return fail('Add feedback so the student knows what to change.');
      await busy($('button[type=submit]', form), async () => {
        try {
          await rpc('grade_submission', { p_submission: id, p_grade: grade, p_feedback: feedback || null });
          toast(`Graded ${GRADE_LABEL[grade]}. The student has been notified.`);
          // The graded card goes away; keyboard focus moves on to the next submission (or the page heading).
          const card = document.getElementById(`s-${id}`);
          const next = card?.nextElementSibling?.querySelector('h2') ?? card?.previousElementSibling?.querySelector('h2') ?? $('h1', ctx.main);
          card?.remove();
          remaining -= 1;
          $('[data-sub]', ctx.main).textContent = subtitle();
          if (!batch) ctx.setToGrade(remaining);
          if (!remaining) $('[data-queue]', ctx.main).innerHTML = String(html`<section class="card empty"><b>Nothing to grade</b>New submissions will appear here.</section>`);
          if (next?.isConnected) { next.tabIndex = -1; next.focus(); }
        } catch (ex) {
          fail(ex.message);
        }
      });
    });
  }
}

// ---------------------------------------------------------------- roster
export async function roster(ctx) {
  const r = await rpc('staff_roster', { p_batch: ctx.params.id });
  if (ctx.stale()) return;
  const b = r.batch;
  ctx.setTitle(`Roster ${b.code}`);
  ctx.render(html`
    <header class="band"><div><p class="eyebrow"><a href="#/teach">Teaching</a> · ${b.program} · Term ${b.term}</p><h1>${b.code} roster</h1>
      <p class="sub">${r.students.length} ${r.students.length === 1 ? 'student' : 'students'} · ${b.week ? `week ${b.week} of ${b.weeks}` : `starts ${fmtDate(b.starts_on)}`}</p></div>
      <a class="btn ghost" href="#/grading?batch=${b.id}">${icon('grade')} Grade this batch</a></header>
    <div class="content"><section class="card">
      ${r.students.length ? html`<div class="tablewrap"><table class="data">
        <thead><tr><th>Student</th><th>Lessons</th><th>Classes</th><th>Projects</th><th>Last active</th></tr></thead>
        <tbody>${r.students.map((s) => html`<tr>
          <td><b>${s.name || s.email}</b>${s.status === 'paused' ? html` <span class="pill">Paused</span>` : ''}<br><span class="small muted">${s.email}</span></td>
          <td style="min-width:140px">${s.lessons_completed}/${r.lessons_total}${progressBar(r.lessons_total ? (100 * s.lessons_completed) / r.lessons_total : 0, false, `${s.name} lessons`)}</td>
          <td>${s.attended}/${r.sessions_held}</td>
          <td>${s.passed}/${r.assignments_total} passed</td>
          <td><span class="pill ${s.days_inactive >= AT_RISK_DAYS ? 'warn' : ''}">${activity(s.days_inactive)}</span></td></tr>`)}</tbody></table></div>`
      : html`<p class="empty"><b>No students yet</b>Students appear here as soon as they enroll.</p>`}
    </section></div>`);
}
