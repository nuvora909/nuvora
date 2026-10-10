// Admin area, part 1: the overview, the student database (search, filters, sort, paging, CSV export) and one
// student's record (enrollments, payments, access history) with Start / Stop / Return to automatic access and
// Record / Void payment. Admins only: the route is hidden from other roles and every call checks require_admin().
import { rpc } from '../api.js';
import { html, icon, toast, busy, $, $$, fmtDate, fmtDateTime, fmtRelative, schoolDayEnd } from '../ui.js';
import { downloadCsv } from '../csv.js';
import {
  ACCESS, ACCESS_FILTERS, ENROLLMENT_STATUS, METHODS, REQUEST_STATUS, accessPill, accessText, money, programs,
  programOptions, options, today, dialog, problem,
} from '../admin-kit.js';

const PAGE_SIZE = 50;
const lastActive = (iso) => (iso ? fmtRelative(iso) : 'Never');
const nameOf = (r) => r.name || r.email;

// The public wording of the rule, from the website (web/assets/js/access-rule.mjs), so both always agree.
async function accessRule() {
  try { return (await import('/js/access-rule.mjs')).ACCESS_RULE; } catch { return null; }
}

// ---------------------------------------------------------------- overview
export async function overview(ctx) {
  const [o, rule] = await Promise.all([rpc('admin_overview'), accessRule()]);
  if (ctx.stale()) return;
  const tile = (n, label, href, tone = '') => html`<a class="tile link ${tone}" href="${href}"><b>${n}</b><span>${label}</span></a>`;
  const list = (rows, empty, when) => (rows.length ? html`<div class="list">${rows.map((r) => html`
      <a class="item rowlink" href="#/admin/student/${r.student_id}"><div class="meta"><b>${r.name || r.email}</b>
        <span>${r.email} · <span class="mono">${r.batch_code}</span> · Term ${r.term}</span></div>
        <span class="row">${when(r)}${accessPill(r)}</span></a>`)}</div>`
    : html`<p class="empty">${empty}</p>`);
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Overview</h1>
      <p class="sub">${o.students} ${o.students === 1 ? 'student account' : 'student accounts'} · ${o.active_enrollments} active ${o.active_enrollments === 1 ? 'enrollment' : 'enrollments'} · access is decided by the database clock, as of ${fmtDateTime(o.now)} · ${o.clock_last_run
        ? `dates move on by themselves (last run ${fmtDateTime(o.clock_last_run)}${o.clock_errors ? `, ${o.clock_errors} ${o.clock_errors === 1 ? 'step' : 'steps'} failed: see the database log` : ''})`
        : 'the automatic date jobs have not run yet (they switch on at go-live)'}</p></div>
      <a class="btn primary" href="#/admin/students">${icon('users')} Student database</a></header>
    <div class="content">
      <section class="card" aria-labelledby="h-access"><div class="cardhead"><h2 id="h-access">Access to the portal</h2><span class="small muted">Active enrollments</span></div>
        <div class="tiles admin">
          ${tile(o.paid, 'Paid', '#/admin/students?access=paid', 'good')}
          ${tile(o.in_grace, 'In the 30-day grace period', '#/admin/students?access=grace&sort=days_left', 'warn')}
          ${tile(o.ending_soon, 'Pausing within 7 days', '#/admin/students?access=ending_soon&sort=days_left', 'warn')}
          ${tile(o.stopped_unpaid, 'Stopped · unpaid', '#/admin/students?access=stopped_unpaid', 'bad')}
          ${tile(o.stopped_manual, 'Stopped by admin', '#/admin/students?access=stopped_manual', 'bad')}
          ${tile(o.started_manual, 'Started by admin', '#/admin/students?access=started_manual')}
        </div></section>
      <section class="card" aria-labelledby="h-more"><div class="cardhead"><h2 id="h-more">Everything else</h2></div>
        <div class="tiles admin">
          ${tile(o.enrolled, 'Students enrolled', '#/admin/students?status=active')}
          ${tile(o.reserved, 'Seats reserved', '#/admin/students?status=reserved')}
          ${tile(o.paused, 'Enrollments paused', '#/admin/students?status=paused')}
          ${tile(o.new_seat_requests, 'New seat requests', '#/admin/requests')}
          ${tile(o.batches_running, 'Batches running or scheduled', '#/admin/batches')}
        </div></section>
      <div class="grid2 even">
        <section class="card" aria-labelledby="h-grace"><div class="cardhead"><div><h2 id="h-grace">In the grace period</h2>
          <p class="sub">Unpaid terms, soonest pause first</p></div></div>
          ${list(o.grace, 'Nobody is in the grace period.', (r) => html`<span class="small muted">pauses ${fmtDateTime(r.ends_at)}</span>`)}</section>
        <section class="card" aria-labelledby="h-stopped"><div class="cardhead"><div><h2 id="h-stopped">Access stopped</h2>
          <p class="sub">Most recent first</p></div></div>
          ${list(o.stopped, 'No student’s access is stopped.', (r) => (r.since ? html`<span class="small muted">since ${fmtDateTime(r.since)}</span>` : ''))}</section>
      </div>
      <section class="card" aria-labelledby="h-rule"><h2 id="h-rule">How the tuition rule works</h2>
        ${rule ? html`<p style="margin-top:8px">${rule}</p>` : ''}
        <p class="small muted" style="margin-top:8px">The database applies it on every request with its own clock, so a pause happens on time even if nobody is signed in.
          Recording a payment opens access again at once. Stop access, Start access and Return to automatic are on each student’s page; every admin action is written to the audit log.</p></section>
    </div>`);
}

// ---------------------------------------------------------------- student database
const SORTS = [['name', 'Name'], ['email', 'Email'], ['last_active', 'Last active'], ['enrolled_at', 'Enrolled'], ['days_left', 'Days left'],
  ['program', 'Program'], ['batch', 'Batch'], ['signed_up', 'Signed up']];
const STATUS_FILTERS = [['', 'Any status'], ...Object.entries(ENROLLMENT_STATUS)];
const PAYMENT_FILTERS = [['', 'Paid or unpaid'], ['paid', 'Paid'], ['unpaid', 'Unpaid']];

function filtersFrom(query) {
  const f = {
    q: (query.get('q') ?? '').slice(0, 100), program: query.get('program') ?? '', status: query.get('status') ?? '',
    payment: query.get('payment') ?? '', access: query.get('access') ?? '', sort: query.get('sort') ?? 'name',
    desc: query.get('desc') === '1', page: Math.max(1, Number.parseInt(query.get('page'), 10) || 1),
  };
  if (!SORTS.some(([v]) => v === f.sort)) f.sort = 'name';
  return f;
}
const argsFor = (f) => ({
  p_search: f.q || null, p_program: f.program || null, p_status: f.status || null, p_payment: f.payment || null,
  p_access: f.access || null, p_sort: f.sort, p_desc: f.desc,
});
function hashFor(f) {
  const q = new URLSearchParams();
  for (const k of ['q', 'program', 'status', 'payment', 'access']) if (f[k]) q.set(k, f[k]);
  if (f.sort !== 'name') q.set('sort', f.sort);
  if (f.desc) q.set('desc', '1');
  if (f.page > 1) q.set('page', String(f.page));
  const s = q.toString();
  return `#/admin/students${s ? `?${s}` : ''}`;
}

const paymentCell = (r) => (!r.access ? html`<span class="muted">·</span>`
  : r.payment === 'paid' ? html`<span class="pill good">${icon('checkc')} Paid ${money(r.access.paid_usd)}</span>`
  : html`<span class="pill">${icon('circle')} Unpaid · ${money(r.access.tuition_usd)} due</span>`);

export async function students(ctx) {
  const f = filtersFrom(ctx.query);
  const [list, progs] = await Promise.all([
    rpc('admin_students', { ...argsFor(f), p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE }), programs()]);
  if (ctx.stale()) return;
  const from = list.total ? list.offset + 1 : 0;
  const to = list.offset + list.rows.length;
  const filtered = Boolean(f.q || f.program || f.status || f.payment || f.access);
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Students</h1>
      <p class="sub">One row per student and program. Access and days left are worked out by the database just now.</p></div>
      <button class="btn ghost" type="button" data-export ${list.total ? '' : 'disabled'}>${icon('sheet')} Export CSV (${list.total})</button></header>
    <div class="content">
      <form class="card filters" role="search" aria-label="Find students" data-filters novalidate>
        <div class="field grow2"><label for="f-q">Search name or email</label>
          <input id="f-q" type="search" maxlength="100" value="${f.q}" placeholder="e.g. maya or @gmail.com" autocomplete="off"></div>
        <div class="field"><label for="f-program">Program</label><select id="f-program">${programOptions(progs, f.program)}</select></div>
        <div class="field"><label for="f-status">Enrollment</label><select id="f-status">${options(STATUS_FILTERS, f.status)}</select></div>
        <div class="field"><label for="f-payment">Payment</label><select id="f-payment">${options(PAYMENT_FILTERS, f.payment)}</select></div>
        <div class="field"><label for="f-access">Access</label><select id="f-access">${options(ACCESS_FILTERS, f.access)}</select></div>
        <div class="field"><label for="f-sort">Sort by</label><select id="f-sort">${options(SORTS, f.sort)}</select></div>
        <div class="field"><label for="f-desc">Order</label><select id="f-desc">${options([['0', 'Ascending'], ['1', 'Descending']], f.desc ? '1' : '0')}</select></div>
        <p class="row filter-actions"><button class="btn primary" type="submit">${icon('search')} Search</button>
          ${filtered ? html`<a class="btn ghost" href="#/admin/students">Clear filters</a>` : ''}</p>
      </form>
      <section class="card" aria-labelledby="h-results">
        <div class="cardhead"><h2 id="h-results" aria-live="polite">${list.total ? `Showing ${from}–${to} of ${list.total}` : 'No students match'}</h2></div>
        ${list.rows.length ? html`<div class="tablewrap"><table class="data cards" data-students>
          <thead><tr><th scope="col">Student</th><th scope="col">Program and batch</th><th scope="col">Enrollment</th><th scope="col">Payment</th>
            <th scope="col">Access</th><th scope="col">Last active</th></tr></thead>
          <tbody>${list.rows.map((r) => html`<tr data-row="${r.student_id}">
            <td data-label="Student"><a class="strong" href="#/admin/student/${r.student_id}">${nameOf(r)}</a><br><span class="small muted">${r.email}</span></td>
            <td data-label="Program">${r.program ? html`${r.program}<br><span class="small muted"><span class="mono">${r.batch_code}</span> · Term ${r.term} of ${r.terms}</span>` : html`<span class="muted">Not enrolled</span>`}</td>
            <td data-label="Enrollment">${r.enrollment_status ? ENROLLMENT_STATUS[r.enrollment_status] : html`<span class="muted">·</span>`}</td>
            <td data-label="Payment">${paymentCell(r)}</td>
            <td data-label="Access">${r.access ? accessPill(r.access) : html`<span class="muted">·</span>`}</td>
            <td data-label="Last active">${lastActive(r.last_active_at)}</td></tr>`)}</tbody></table></div>
          <nav class="spread pager" aria-label="Pages">
            ${f.page > 1 ? html`<a class="btn ghost sm" href="${hashFor({ ...f, page: f.page - 1 })}">${icon('prev')} Previous</a>` : html`<span></span>`}
            <span class="small muted">Page ${f.page} of ${Math.max(1, Math.ceil(list.total / PAGE_SIZE))}</span>
            ${to < list.total ? html`<a class="btn ghost sm" href="${hashFor({ ...f, page: f.page + 1 })}">Next ${icon('next')}</a>` : html`<span></span>`}
          </nav>`
        : html`<p class="empty"><b>No students match these filters</b>${filtered ? 'Try fewer filters, or clear them.' : 'Students appear here when they sign up.'}</p>`}
      </section>
    </div>`);

  const form = $('[data-filters]', ctx.main);
  const read = () => ({
    q: $('#f-q', form).value.trim(), program: $('#f-program', form).value, status: $('#f-status', form).value,
    payment: $('#f-payment', form).value, access: $('#f-access', form).value, sort: $('#f-sort', form).value,
    desc: $('#f-desc', form).value === '1', page: 1,
  });
  // A search lands on the results heading, so a keyboard or screen-reader user hears how many matched.
  form.addEventListener('submit', (e) => { e.preventDefault(); ctx.go(hashFor(read()), '#h-results'); });
  for (const s of $$('select', form)) s.addEventListener('change', () => ctx.go(hashFor(read())));
  $('[data-export]', ctx.main)?.addEventListener('click', (e) => { const b = e.currentTarget; busy(b, () => exportCsv(f)); });
}

// Every row of the current filter (not only this page), fetched 200 at a time.
async function exportCsv(f) {
  try {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = await rpc('admin_students', { ...argsFor(f), p_limit: 200, p_offset: offset });
      rows.push(...page.rows);
      if (rows.length >= page.total || !page.rows.length) break;
    }
    const a = (r) => r.access ?? {};
    downloadCsv(`nuvora-students-${today()}.csv`, [
      ['Name', 'Email', 'Program', 'Batch', 'Term', 'Enrollment', 'Payment', 'Paid (USD)', 'Tuition per term (USD)', 'Access',
        'Days left', 'Access pauses at', 'Last active', 'Signed up'],
      ...rows.map((r) => [r.name, r.email, r.program, r.batch_code, r.term, r.enrollment_status ? ENROLLMENT_STATUS[r.enrollment_status] : 'Not enrolled',
        r.payment, r.access ? Number(a(r).paid_usd) : null, r.access ? Number(a(r).tuition_usd) : null, r.access ? (ACCESS[a(r).state]?.[1] ?? a(r).state) : null,
        a(r).days_left ?? null, a(r).ends_at ?? null, r.last_active_at, r.signed_up_at]),
    ]);
    toast(`Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} to a CSV file.`);
  } catch (e) {
    toast(`Export failed: ${e.message}`);
  }
}

// ---------------------------------------------------------------- one student
const HISTORY = {
  stopped: 'Access stopped', restored: 'Access opened again', mode_off: 'Stopped by an admin', mode_on: 'Started by an admin', mode_auto: 'Returned to automatic',
};
const ACTIONS = {
  'access.set': 'Changed access', 'payment.record': 'Recorded a payment', 'payment.void': 'Voided a payment', 'enrollment.create': 'Enrolled',
  'enrollment.transfer': 'Moved to another batch', 'enrollment.status': 'Changed enrollment status', 'user.role': 'Changed role',
  'seat_request.update': 'Updated a seat request', 'seat_request.convert': 'Converted a seat request',
};

function accessDetails(a) {
  const rows = [];
  if (a.mode === 'off') rows.push(['Stopped by', `${a.set_by ?? 'an admin'}${a.set_at ? `, ${fmtDateTime(a.set_at)}` : ''}`], ['Private reason', a.reason ?? '']);
  if (a.mode === 'on') rows.push(['Started by', `${a.set_by ?? 'an admin'}${a.set_at ? `, ${fmtDateTime(a.set_at)}` : ''}`], ['Until', a.until ? fmtDateTime(a.until) : 'Until changed'], ...(a.reason ? [['Note', a.reason]] : []));
  rows.push(['Mode', a.mode === 'auto' ? 'Automatic (payment rule)' : a.mode === 'on' ? 'Started manually' : 'Stopped manually']);
  rows.push(['Paid', `${money(a.paid_usd)} of ${money(a.tuition_usd)} per term`]);
  if (a.grace_started_at) rows.push(['30 days', `${fmtDateTime(a.grace_started_at)} to ${fmtDateTime(a.grace_ends_at)}`]);
  if (a.ends_at) rows.push(['Pauses at', `${fmtDateTime(a.ends_at)} (${accessText(a).split(' · ').pop()})`]);
  return html`<dl class="facts">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

function paymentsTable(e) {
  if (!e.payments.length) return html`<p class="small muted">No payments recorded for this term.</p>`;
  return html`<div class="tablewrap"><table class="data cards"><caption class="sr">Payments for ${e.batch.code}</caption>
    <thead><tr><th scope="col">Paid on</th><th scope="col">Amount</th><th scope="col">Method</th><th scope="col">Reference</th><th scope="col">Recorded</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
    <tbody>${e.payments.map((p) => html`<tr class="${p.voided ? 'voided' : ''}">
      <td data-label="Paid on">${fmtDate(p.paid_on)}</td>
      <td data-label="Amount"><b>${money(p.amount_usd)}</b>${p.voided ? html` <span class="pill bad">${icon('alert')} Voided</span>` : ''}</td>
      <td data-label="Method">${METHODS[p.method] ?? p.method}</td>
      <td data-label="Reference"><span class="mono">${p.reference ?? '·'}</span>${p.note ? html`<br><span class="small muted">${p.note}</span>` : ''}</td>
      <td data-label="Recorded"><span class="small">${p.recorded_by ?? 'Nuvora'}, ${fmtDateTime(p.recorded_at)}</span>
        ${p.voided ? html`<br><span class="small muted">Voided by ${p.voided_by ?? 'an admin'}: ${p.void_reason}</span>` : ''}</td>
      <td data-label="">${p.voided ? '' : html`<button class="btn ghost sm" type="button" data-void="${p.id}" data-amount="${money(p.amount_usd)}">Void</button>`}</td></tr>`)}</tbody></table></div>`;
}

function enrollmentCard(e) {
  const a = e.access;
  const live = ['active', 'completed'].includes(e.status);
  return html`<section class="card enrollment" aria-labelledby="e-${e.id}" data-enrollment="${e.id}">
    <div class="spread"><div><h2 id="e-${e.id}">${e.program}</h2>
      <p class="sub"><span class="mono">${e.batch.code}</span> · Term ${e.batch.term}: ${e.batch.term_title} · ${fmtDate(e.batch.starts_on)} to ${fmtDate(e.batch.ends_on)}</p></div>
      <span class="row"><span class="pill">${ENROLLMENT_STATUS[e.status]}</span>${accessPill(a)}</span></div>
    ${accessDetails(a)}
    ${live ? html`<div class="row actions" role="group" aria-label="Access for ${e.batch.code}">
      ${a.mode !== 'off' ? html`<button class="btn danger sm" type="button" data-stop="${e.id}">${icon('lock')} Stop access</button>` : ''}
      ${a.mode !== 'on' ? html`<button class="btn primary sm" type="button" data-start="${e.id}">${icon('shield')} Start access</button>` : ''}
      ${a.mode !== 'auto' ? html`<button class="btn ghost sm" type="button" data-auto="${e.id}">Return to automatic</button>` : ''}
      <button class="btn ghost sm" type="button" data-pay="${e.id}" data-tuition="${a.tuition_usd}">${icon('plus')} Record payment</button></div>`
    : html`<p class="small muted">This enrollment is ${ENROLLMENT_STATUS[e.status].toLowerCase()}, so it opens nothing whatever the payments or access setting.</p>`}
    <h3>Payments for this term</h3>
    ${paymentsTable(e)}
  </section>`;
}

export async function student(ctx) {
  const s = await rpc('admin_student', { p_student: ctx.params.id });
  if (ctx.stale()) return;
  const p = s.profile;
  ctx.setTitle(p.name || p.email);
  const byId = Object.fromEntries(s.enrollments.map((e) => [e.id, e]));
  ctx.render(html`
    <header class="band"><div><p class="eyebrow"><a href="#/admin/students">Students</a> · ${p.role}</p><h1>${p.name || p.email}</h1>
      <p class="sub">${p.email} · signed up ${fmtDate(p.signed_up_at)} · last active ${lastActive(p.last_active_at)}</p></div></header>
    <div class="content">
      ${s.enrollments.length ? s.enrollments.map(enrollmentCard) : html`<section class="card empty"><b>Not enrolled</b>This person has no enrollments yet. Enroll them from a seat request, or ask Claude Code to enroll them by email.</section>`}
      <div class="grid2 even">
        <section class="card" aria-labelledby="h-hist"><h2 id="h-hist">Access history</h2>
          ${s.access_history.length ? html`<ol class="timeline">${s.access_history.map((h) => html`<li>
            <b>${HISTORY[h.kind] ?? h.kind}${h.state ? html` · ${ACCESS[h.state]?.[1] ?? h.state}` : ''}</b>
            <span class="small muted">${fmtDateTime(h.created_at)} · <span class="mono">${h.batch_code}</span> · ${h.actor ?? 'automatic (database rule)'}</span>
            ${h.reason ? html`<span class="small">Reason: ${h.reason}</span>` : ''}${h.until ? html`<span class="small">Until ${fmtDateTime(h.until)}</span>` : ''}</li>`)}</ol>`
          : html`<p class="empty">No access changes recorded yet.</p>`}</section>
        <section class="card" aria-labelledby="h-audit"><h2 id="h-audit">Admin actions</h2>
          ${s.audit.length ? html`<ol class="timeline">${s.audit.map((a) => html`<li>
            <b>${ACTIONS[a.action] ?? a.action}</b><span class="small muted">${fmtDateTime(a.created_at)} · by ${a.actor ?? a.actor_email ?? 'an admin'}</span></li>`)}</ol>`
          : html`<p class="empty">No admin actions about this person yet.</p>`}</section>
      </div>
      ${s.seat_requests.length ? html`<section class="card" aria-labelledby="h-req"><h2 id="h-req">Seat requests</h2><div class="list">${s.seat_requests.map((r) => html`
        <div class="item"><div class="meta"><b>${r.program_name}</b><span>Start ${fmtDate(r.start_date)} · sent ${fmtDateTime(r.created_at)}</span></div>
          <span class="pill">${REQUEST_STATUS[r.status]}</span></div>`)}</div></section>` : ''}
    </div>`);

  const done = async (message) => { toast(message); ctx.invalidate(); await ctx.refresh(); };
  const label = (id) => byId[id].batch.code;
  for (const b of $$('[data-stop]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: `Stop access for ${p.name || p.email}?`, confirm: 'Stop access now', danger: true,
        body: html`<p>${label(b.dataset.stop)}: lessons, PDFs, live-class links, projects and recordings close immediately, whatever the payments. The student sees that Nuvora paused their access, not your reason.</p>
          <div class="field"><label for="d-reason">Reason (private, for admins)</label><textarea id="d-reason" maxlength="500" required></textarea></div>`,
        action: async (form) => {
          const reason = $('#d-reason', form).value.trim();
          if (!reason) throw problem('Write a short reason. Only admins see it.', '#d-reason');
          return rpc('admin_set_access', { p_enrollment: b.dataset.stop, p_mode: 'off', p_reason: reason });
        },
      });
      if (r) await done('Access stopped. The student can no longer open this term.');
    });
  }
  for (const b of $$('[data-start]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: `Start access for ${p.name || p.email}?`, confirm: 'Start access now',
        body: html`<p>${label(b.dataset.start)}: opens this term now, even if it isn’t paid. Without an end date it stays open until you change it.</p>
          <div class="field"><label for="d-until">End date (optional)</label><input id="d-until" type="date" min="${today()}" aria-describedby="d-until-hint">
            <span class="hint" id="d-until-hint">Access stays open until the end of this day in US Eastern Time, then the payment rule applies again.</span></div>
          <div class="field"><label for="d-note">Note (optional, private)</label><textarea id="d-note" maxlength="500"></textarea></div>`,
        action: async (form) => {
          const until = $('#d-until', form).value;
          return rpc('admin_set_access', { p_enrollment: b.dataset.start, p_mode: 'on', p_until: until ? schoolDayEnd(until) : null,
                                           p_reason: $('#d-note', form).value.trim() || null });
        },
      });
      if (r) await done(r.until ? `Access started until ${fmtDateTime(r.until)}.` : 'Access started until you change it.');
    });
  }
  for (const b of $$('[data-auto]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: 'Return to automatic?', confirm: 'Return to automatic',
        body: html`<p>${label(b.dataset.auto)}: the payment rule decides again. If the term is unpaid and its 30 days are over, access stops at once.</p>
          <div class="field"><label for="d-note">Note (optional, private)</label><textarea id="d-note" maxlength="500"></textarea></div>`,
        action: (form) => rpc('admin_set_access', { p_enrollment: b.dataset.auto, p_mode: 'auto', p_reason: $('#d-note', form).value.trim() || null }),
      });
      if (r) await done(`Back to automatic: ${accessText(r)}.`);
    });
  }
  for (const b of $$('[data-pay]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: `Record a payment for ${p.name || p.email}`, confirm: 'Record payment',
        body: html`<p>${label(b.dataset.pay)}. The term counts as paid as soon as one payment is recorded, and access opens at once.</p>
          <div class="grid2 even tight">
            <div class="field"><label for="d-amount">Amount (USD)</label><input id="d-amount" type="number" min="0" max="100000" step="0.01" inputmode="decimal" required value="${b.dataset.tuition}"></div>
            <div class="field"><label for="d-method">Method</label><select id="d-method">${options(Object.entries(METHODS), 'bank_transfer')}</select></div>
            <div class="field"><label for="d-ref">Reference</label><input id="d-ref" type="text" maxlength="100" placeholder="Bank or receipt reference"></div>
            <div class="field"><label for="d-date">Paid on</label><input id="d-date" type="date" max="${today()}" value="${today()}" required></div>
          </div>
          <div class="field"><label for="d-note">Note (optional)</label><textarea id="d-note" maxlength="1000"></textarea></div>`,
        action: async (form) => {
          const amount = Number($('#d-amount', form).value);
          const method = $('#d-method', form).value;
          if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && method !== 'waiver')) throw problem('Enter the amount received, in US dollars (more than 0, or 0 for a waiver).', '#d-amount');
          return rpc('admin_record_payment', {
            p_enrollment: b.dataset.pay, p_amount_usd: amount, p_method: method, p_reference: $('#d-ref', form).value.trim() || null,
            p_note: $('#d-note', form).value.trim() || null, p_paid_on: $('#d-date', form).value || null,
          });
        },
      });
      if (r) await done(`Payment of ${money(r.payment.amount_usd)} recorded. Access: ${accessText(r.access)}.`);
    });
  }
  for (const b of $$('[data-void]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: `Void the ${b.dataset.amount} payment?`, confirm: 'Void payment', danger: true,
        body: html`<p>The payment stays in the ledger, marked as voided. If it was the term’s only payment and the 30 days are over, access stops at once.</p>
          <div class="field"><label for="d-reason">Reason</label><textarea id="d-reason" maxlength="500" required></textarea></div>`,
        action: async (form) => {
          const reason = $('#d-reason', form).value.trim();
          if (!reason) throw problem('Write why this payment is voided.', '#d-reason');
          return rpc('admin_void_payment', { p_payment: b.dataset.void, p_reason: reason });
        },
      });
      if (r) await done(`Payment voided. Access: ${accessText(r.access)}.`);
    });
  }
}
