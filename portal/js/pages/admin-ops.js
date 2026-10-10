// Admin area, part 2: batches (create, capacity, status, live-class link, instructors), staff roles, seat
// requests from the website, and PDF materials (upload, attach to a lesson or project, remove).
// Admins only: every call below starts with require_admin() in the database.
import { rpc, uploadPdf, removeFiles, pdfProblem } from '../api.js';
import { html, icon, toast, $, $$, safeUrl, fmtDate, fmtDateTime, fmtBytes, schoolToday } from '../ui.js';
import { REQUEST_STATUS, programs, programOptions, options, onSubmit, dialog, problem } from '../admin-kit.js';

const BATCH_STATUS = { scheduled: 'Scheduled', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
const BATCH_TONE = { scheduled: 'info', active: 'good', completed: '', cancelled: 'bad' };
const STAFF_ROLES = [['instructor', 'Instructor'], ['mentor', 'Mentor'], ['coach', 'Coach']];
const ROLES = [['student', 'Student'], ['instructor', 'Instructor'], ['admin', 'Admin']];

// The next Monday on or after today: batches always start on a Monday.
function nextMonday() {
  const [y, m, day] = schoolToday().split('-').map(Number);   // today in the school's time zone
  const d = new Date(Date.UTC(y, m - 1, day));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
const isMonday = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).getDay() === 1; };

// ---------------------------------------------------------------- batches
export async function batches(ctx) {
  const status = ctx.query.get('status') ?? '';
  const program = ctx.query.get('program') ?? '';
  const [list, staff, progs] = await Promise.all([
    rpc('admin_batches', { p_status: status || null, p_program: program || null }), rpc('admin_staff'), programs()]);
  if (ctx.stale()) return;
  const teachers = staff.filter((s) => s.role === 'instructor' || s.role === 'admin');
  const hashFor = (s, p) => { const q = new URLSearchParams(); if (s) q.set('status', s); if (p) q.set('program', p); return `#/admin/batches${q.size ? `?${q}` : ''}`; };

  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Batches</h1>
      <p class="sub">New batches of every program start each month on its first Monday. The database creates them on its own, eight starts ahead, and each next-term batch as soon as students are in the term before. Create one here only for any other Monday or term.</p></div></header>
    <div class="content">
      <form class="card" novalidate data-create aria-labelledby="h-create">
        <h2 id="h-create">Create a batch</h2>
        <p class="formerr" role="alert" tabindex="-1" hidden></p>
        <div class="formgrid">
          <div class="field"><label for="c-program">Program</label><select id="c-program" required>${programOptions(progs, program || progs[0]?.id, '')}</select></div>
          <div class="field"><label for="c-term">Term</label><input id="c-term" type="number" min="1" max="12" step="1" value="1" required></div>
          <div class="field"><label for="c-start">Starts on (a Monday)</label><input id="c-start" type="date" value="${nextMonday()}" required></div>
          <p class="formgrid-end"><button class="btn primary" type="submit">${icon('plus')} Create batch</button></p>
        </div>
      </form>
      <form class="card filters slim" role="search" aria-label="Filter batches" data-filter>
        <div class="field"><label for="b-status">Show</label><select id="b-status">${options([['', 'Running and scheduled'], ['all', 'All batches'],
          ...Object.entries(BATCH_STATUS)], status)}</select></div>
        <div class="field"><label for="b-program">Program</label><select id="b-program">${programOptions(progs, program)}</select></div>
      </form>
      <p class="small muted" aria-live="polite">${list.length} ${list.length === 1 ? 'batch' : 'batches'}</p>
      ${list.length ? html`<div class="grid2 even">${list.map((b) => batchCard(b, teachers))}</div>`
        : html`<section class="card empty"><b>No batches here</b>Change the filter, or create a batch above.</section>`}
    </div>`);

  for (const s of $$('[data-filter] select', ctx.main)) s.addEventListener('change', () => ctx.go(hashFor($('#b-status', ctx.main).value, $('#b-program', ctx.main).value)));
  const create = $('[data-create]', ctx.main);
  onSubmit(create, async () => {
    const p = $('#c-program', create).value;
    const term = Number($('#c-term', create).value);
    const start = $('#c-start', create).value;
    const max = progs.find((x) => x.id === p)?.terms ?? 12;
    if (!Number.isInteger(term) || term < 1 || term > max) throw problem(`Choose a term from 1 to ${max} for this program.`, '#c-term');
    if (!start) throw problem('Choose the start date.', '#c-start');
    if (!isMonday(start)) throw problem('Batches start on a Monday. Choose a Monday.', '#c-start');
    const id = await rpc('admin_create_batch', { p_program: p, p_starts_on: start, p_term: term });
    const all = await rpc('admin_batches', { p_status: 'all', p_program: p });
    const made = all.find((b) => b.id === id);
    ctx.go(hashFor('all', p));
    return made ? `Batch ${made.code} is ready (${fmtDate(made.starts_on)}, term ${made.term}).` : 'Batch created.';
  });
  wireBatchCards(ctx);
}

function batchCard(b, teachers) {
  const assigned = new Set(b.instructors.map((i) => i.id));
  const free = teachers.filter((t) => !assigned.has(t.id));
  const link = b.next_session?.join_url && safeUrl(b.next_session.join_url);
  return html`<section class="card batch" aria-labelledby="b-${b.id}" data-batch="${b.id}">
    <div class="spread"><div><h2 id="b-${b.id}" class="mono">${b.code}</h2><p class="sub">${b.program}<br>Term ${b.term}: ${b.term_title}</p></div>
      <span class="pill ${BATCH_TONE[b.status]}">${BATCH_STATUS[b.status]}</span></div>
    <dl class="facts">
      <div><dt>Dates</dt><dd>${fmtDate(b.starts_on)} to ${fmtDate(b.ends_on)} (${b.timezone})</dd></div>
      <div><dt>Seats</dt><dd>${b.seats_taken} of ${b.capacity} taken · ${b.enrolled.active} active, ${b.enrolled.reserved} reserved${b.enrolled.paused ? `, ${b.enrolled.paused} paused` : ''}</dd></div>
      <div><dt>Live classes</dt><dd>${b.sessions.upcoming} upcoming · ${b.sessions.upcoming_with_link} with a join link</dd></div>
      ${b.next_session ? html`<div><dt>Next class</dt><dd>${b.next_session.title}<br>${fmtDateTime(b.next_session.starts_at)}${link ? html` · <a href="${link}" target="_blank" rel="noopener noreferrer">join link ${icon('ext')}</a>` : ''}</dd></div>` : ''}
    </dl>
    <h3>Instructors</h3>
    ${b.instructors.length ? html`<ul class="people">${b.instructors.map((i) => html`<li><span><b>${i.name || i.email}</b> <span class="small muted">${i.role} · ${i.email}</span></span>
      <button class="btn ghost sm" type="button" data-unassign="${i.id}" data-name="${i.name || i.email}">Unassign</button></li>`)}</ul>`
      : html`<p class="small muted">Nobody is assigned yet.</p>`}
    ${free.length ? html`<details class="assignto"><summary class="btn ghost sm">${icon('plus')} Assign an instructor</summary>
      <form class="row assign" novalidate data-assign>
        <p class="formerr" role="alert" tabindex="-1" hidden></p>
        <div class="field"><label for="a-${b.id}">Assign</label><select id="a-${b.id}" data-person>${free.map((t) => html`<option value="${t.id}">${t.name || t.email} (${t.role})</option>`)}</select></div>
        <div class="field"><label for="r-${b.id}">As</label><select id="r-${b.id}" data-role>${options(STAFF_ROLES, 'instructor')}</select></div>
        <button class="btn ghost" type="submit">Assign</button>
      </form></details>` : html`<p class="small muted">Every instructor and admin already teaches this batch.</p>`}
    <details class="edit"><summary>Edit capacity, status or live-class link</summary>
      <form class="stack" novalidate data-edit>
        <p class="formerr" role="alert" tabindex="-1" hidden></p>
        <div class="formgrid">
          <div class="field"><label for="cap-${b.id}">Capacity</label><input id="cap-${b.id}" type="number" min="${Math.max(1, b.seats_taken)}" max="500" value="${b.capacity}" data-capacity></div>
          <div class="field"><label for="st-${b.id}">Status</label><select id="st-${b.id}" data-status>${options(Object.entries(BATCH_STATUS), b.status)}</select></div>
        </div>
        <div class="field"><label for="url-${b.id}">Live-class link for every upcoming class</label>
          <input id="url-${b.id}" type="url" inputmode="url" maxlength="500" placeholder="https://meet.jit.si/..." data-url aria-describedby="url-h-${b.id}">
          <span class="hint" id="url-h-${b.id}">Leave empty to keep the current links. Students see a link only from 15 minutes before each class until it ends.</span></div>
        <label class="remember"><input type="checkbox" data-clear> Remove the links from upcoming classes</label>
        <p><button class="btn primary" type="submit">Save changes</button></p>
      </form></details>
  </section>`;
}

function wireBatchCards(ctx) {
  for (const card of $$('[data-batch]', ctx.main)) {
    const id = card.dataset.batch;
    const code = $('h2', card).textContent;
    const assign = $('[data-assign]', card);
    if (assign) onSubmit(assign, async (form) => {
      const person = $('[data-person]', form);
      if (!person.value) throw problem('Choose someone to assign.', '[data-person]');
      await rpc('admin_assign_staff', { p_batch: id, p_user: person.value, p_role: $('[data-role]', form).value });
      const name = person.selectedOptions[0].textContent.replace(/ \(.*\)$/, '');
      await ctx.refresh();
      return `${name} now teaches ${code}.`;
    });
    for (const b of $$('[data-unassign]', card)) {
      b.addEventListener('click', async () => {
        const r = await dialog({
          title: `Unassign ${b.dataset.name}?`, confirm: 'Unassign', danger: true,
          body: html`<p>${b.dataset.name} will no longer see ${code}, its roster or its submissions.</p>`,
          action: () => rpc('admin_unassign_staff', { p_batch: id, p_user: b.dataset.unassign }),
        });
        if (r) { toast(`${b.dataset.name} no longer teaches ${code}.`); await ctx.refresh(); }
      });
    }
    onSubmit($('[data-edit]', card), async (form) => {
      const capacity = Number($('[data-capacity]', form).value);
      const url = $('[data-url]', form).value.trim();
      const clear = $('[data-clear]', form).checked;
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw problem('Capacity must be a whole number from 1 to 500.', '[data-capacity]');
      if (url && (!/^https:\/\/\S+$/.test(url) || !safeUrl(url))) throw problem('The link must start with https:// and have no spaces.', '[data-url]');
      const r = await rpc('admin_update_batch', {
        p_batch: id, p_capacity: capacity, p_status: $('[data-status]', form).value, p_join_url: clear ? '' : url || null,
      });
      await ctx.refresh();
      return `${r.code} saved: ${r.capacity} seats, ${BATCH_STATUS[r.status].toLowerCase()}, ${r.sessions.upcoming_with_link} upcoming ${r.sessions.upcoming_with_link === 1 ? 'class' : 'classes'} with a link.`;
    });
  }
}

// ---------------------------------------------------------------- staff
export async function staff(ctx) {
  const list = await rpc('admin_staff');
  if (ctx.stale()) return;
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Staff</h1>
      <p class="sub">Instructors teach the batches they’re assigned to (Batches page). Admins can do everything here.</p></div></header>
    <div class="content">
      <form class="card" novalidate data-role-form aria-labelledby="h-role">
        <h2 id="h-role">Set someone’s role</h2>
        <p class="sub">They need to sign up first, with this email. Making someone a student removes them from every batch they teach.</p>
        <p class="formerr" role="alert" tabindex="-1" hidden></p>
        <div class="formgrid">
          <div class="field grow2"><label for="s-email">Email address</label><input id="s-email" type="email" autocomplete="off" required maxlength="200"></div>
          <div class="field"><label for="s-role">Role</label><select id="s-role">${options(ROLES, 'instructor')}</select></div>
          <p class="formgrid-end"><button class="btn primary" type="submit">Set role</button></p>
        </div>
      </form>
      <section class="card" aria-labelledby="h-staff"><h2 id="h-staff">Instructors and admins (${list.length})</h2>
        <div class="tablewrap"><table class="data cards">
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Batches</th></tr></thead>
          <tbody>${list.map((p) => html`<tr><td data-label="Name"><b>${p.name || p.email}</b><br><span class="small muted">${p.email}</span></td>
            <td data-label="Role"><span class="pill ${p.role === 'admin' ? 'info' : ''}">${p.role === 'admin' ? 'Admin' : 'Instructor'}</span></td>
            <td data-label="Batches">${p.batches.length ? p.batches.map((b) => html`<span class="mono chip">${b.code}</span> `) : html`<span class="muted">None</span>`}</td></tr>`)}</tbody>
        </table></div></section>
    </div>`);
  const form = $('[data-role-form]', ctx.main);
  onSubmit(form, async () => {
    const email = $('#s-email', form).value.trim();
    const role = $('#s-role', form).value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw problem('Enter an email address, like name@example.com.', '#s-email');
    const label = ROLES.find(([v]) => v === role)[1].toLowerCase();
    const a = role === 'student' ? 'a' : 'an';
    const r = await dialog({
      title: `Make ${email} ${a} ${label}?`, confirm: `Make ${label}`, danger: role !== 'instructor',
      body: html`<p>${role === 'admin' ? 'Admins can see every student, record payments, stop or start access and change roles.'
        : role === 'student' ? 'They lose staff access and are removed from every batch they teach.' : 'They can then be assigned to teach batches.'}</p>`,
      action: () => rpc('admin_set_role_by_email', { p_email: email, p_role: role }),
    });
    if (!r) return null;
    await ctx.refresh();
    return `${r.name || r.email} is now ${a} ${label}.`;
  });
}

// ---------------------------------------------------------------- seat requests
export async function requests(ctx) {
  const status = ctx.query.get('status') ?? '';
  const list = await rpc('admin_seat_requests', { p_status: status || null });
  if (ctx.stale()) return;
  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Seat requests</h1>
      <p class="sub">Requests from the website’s “Request a seat” form, newest first. The reference is for admins only.</p></div></header>
    <div class="content">
      <form class="card filters slim" role="search" aria-label="Filter seat requests" data-filter>
        <div class="field"><label for="q-status">Status</label><select id="q-status">${options([['', 'All requests'], ...Object.entries(REQUEST_STATUS)], status)}</select></div>
      </form>
      <p class="small muted" aria-live="polite">${list.length} ${list.length === 1 ? 'request' : 'requests'}</p>
      ${list.length ? list.map(requestCard) : html`<section class="card empty"><b>No seat requests here</b>New requests from the website appear here.</section>`}
    </div>`);
  $('#q-status', ctx.main).addEventListener('change', (e) => ctx.go(e.target.value ? `#/admin/requests?status=${e.target.value}` : '#/admin/requests'));

  for (const card of $$('[data-request]', ctx.main)) {
    const id = card.dataset.request;
    onSubmit($('[data-update]', card), async (form) => {
      const r = await rpc('admin_update_seat_request', { p_id: id, p_status: $('[data-status]', form).value, p_notes: $('[data-notes]', form).value });
      await ctx.refresh();
      return `Request from ${r.full_name} saved as ${REQUEST_STATUS[r.status].toLowerCase()}.`;
    });
    $('[data-convert]', card)?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const r = await dialog({
        title: `Enroll ${b.dataset.name}?`, confirm: 'Enroll',
        body: html`<p>Enrolls their account in term 1 of ${b.dataset.program}. The 30-day tuition rule starts with the term (or today, if later).</p>
          <div class="field"><label for="d-start">Batch start date (a Monday)</label><input id="d-start" type="date" value="${b.dataset.start}" required></div>`,
        action: async (form) => {
          const start = $('#d-start', form).value;
          if (!start || !isMonday(start)) throw problem('Choose a Monday: batches start on Mondays.', '#d-start');
          return rpc('admin_convert_seat_request', { p_id: id, p_starts_on: start });
        },
      });
      if (r) { toast(`${b.dataset.name} is enrolled. The request is marked converted.`); await ctx.refresh(); }
    });
  }
}

function requestCard(r) {
  const details = Object.entries(r.details ?? {}).filter(([, v]) => v !== null && v !== '');
  return html`<section class="card request" aria-labelledby="sr-${r.id}" data-request="${r.id}">
    <div class="spread"><div><h2 id="sr-${r.id}">${r.full_name}</h2>
      <p class="sub">${r.email}${r.phone ? ` · ${r.phone}` : ''} · ${r.country}</p></div>
      <span class="row"><span class="mono small">${r.reference}</span><span class="pill ${r.status === 'new' ? 'info' : r.status === 'converted' ? 'good' : ''}">${REQUEST_STATUS[r.status]}</span></span></div>
    <dl class="facts">
      <div><dt>Program</dt><dd>${r.program_name}</dd></div>
      <div><dt>Wants to start</dt><dd>${fmtDate(r.start_date)} (apply by ${fmtDate(r.apply_by)})</dd></div>
      <div><dt>Sent</dt><dd>${fmtDateTime(r.created_at)}${r.handled_by ? ` · handled by ${r.handled_by}` : ''}</dd></div>
      ${details.map(([k, v]) => html`<div><dt>${k.replace(/_/g, ' ')}</dt><dd>${typeof v === 'object' ? JSON.stringify(v) : v}</dd></div>`)}
    </dl>
    <form class="stack" novalidate data-update>
      <p class="formerr" role="alert" tabindex="-1" hidden></p>
      <div class="formgrid">
        <div class="field"><label for="st-${r.id}">Status</label><select id="st-${r.id}" data-status>${options(Object.entries(REQUEST_STATUS), r.status)}</select></div>
        <div class="field grow2"><label for="n-${r.id}">Notes (admins only)</label><textarea id="n-${r.id}" maxlength="2000" data-notes>${r.notes ?? ''}</textarea></div>
      </div>
      <p class="row"><button class="btn ghost" type="submit">Save</button>
        ${['converted', 'closed'].includes(r.status) ? '' : r.account_id
          ? html`<button class="btn primary" type="button" data-convert data-name="${r.full_name}" data-program="${r.program_name}" data-start="${r.start_date}">Convert to enrollment</button>`
          : html`<span class="small muted">No account with this email yet. Ask them to sign up, then convert the request.</span>`}</p>
    </form>
  </section>`;
}

// ---------------------------------------------------------------- PDF materials
// The lessons and projects to attach files to come from admin_program_outline: every term of the program,
// whether or not it has a batch yet.
const slug = (name) => name.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

export async function materials(ctx) {
  const progs = await programs();
  const program = progs.some((p) => p.id === ctx.query.get('program')) ? ctx.query.get('program') : progs[0]?.id;
  const termNo = Number(ctx.query.get('term')) || 0;
  const [mats, out] = await Promise.all([rpc('admin_materials', { p_program: program }), rpc('admin_program_outline', { p_program: program })]);
  if (ctx.stale()) return;
  const terms = out.terms.filter((t) => (!termNo || t.term === termNo) && (t.lessons.length || t.projects.length));
  const shown = mats.materials.filter((m) => !termNo || (m.lesson ?? m.assignment).term === termNo);
  const hashFor = (p, t) => `#/admin/materials?program=${encodeURIComponent(p)}${t ? `&term=${t}` : ''}`;
  const maxTerm = progs.find((p) => p.id === program)?.terms ?? 1;

  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Materials</h1>
      <p class="sub">PDFs that students of a term can download from its lessons and projects. Only PDFs, up to 50 MB. Videos are never uploaded here and never downloadable.</p></div></header>
    <div class="content">
      <form class="card filters slim" role="search" aria-label="Choose program and term" data-filter>
        <div class="field grow2"><label for="m-program">Program</label><select id="m-program">${programOptions(progs, program, '')}</select></div>
        <div class="field"><label for="m-term">Term</label><select id="m-term">${options([['0', 'All terms'], ...Array.from({ length: maxTerm }, (_, i) => [String(i + 1), `Term ${i + 1}`])], String(termNo))}</select></div>
      </form>
      <form class="card" novalidate data-upload aria-labelledby="h-up">
        <h2 id="h-up">Upload a PDF</h2>
        ${terms.length ? '' : html`<p class="small muted">No lessons or projects are listed for ${termNo ? `term ${termNo} of ` : ''}this program yet. Choose another program or term.</p>`}
        <p class="formerr" role="alert" tabindex="-1" hidden></p>
        <div class="formgrid">
          <div class="field grow2"><label for="u-target">Attach to</label><select id="u-target" required>
            ${terms.map((t) => html`<optgroup label="Term ${t.term}${t.title ? `: ${t.title}` : ''}">
              ${t.lessons.map((l) => html`<option value="lesson:${l.id}" data-code="${l.code}">${l.code} · ${l.title}</option>`)}
              ${t.projects.map((p) => html`<option value="project:${p.id}">Project · ${p.title}</option>`)}</optgroup>`)}
          </select></div>
          <div class="field grow2"><label for="u-title">Title students see</label><input id="u-title" type="text" maxlength="120" required placeholder="e.g. Lecture notes · Week 1"></div>
          <div class="field grow2"><label for="u-file">PDF file</label><input id="u-file" type="file" accept="application/pdf,.pdf" required aria-describedby="u-file-h">
            <span class="hint" id="u-file-h">PDF only, up to 50 MB.</span></div>
          <p class="formgrid-end"><button class="btn primary" type="submit" ${terms.length ? '' : 'disabled'}>${icon('upload')} Upload and attach</button></p>
        </div>
      </form>
      <section class="card" aria-labelledby="h-mats"><h2 id="h-mats">Attached PDFs (${shown.length})</h2>
        ${shown.length ? html`<div class="tablewrap"><table class="data cards">
          <thead><tr><th scope="col">Title</th><th scope="col">Attached to</th><th scope="col">File</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
          <tbody>${shown.map((m) => html`<tr>
            <td data-label="Title"><b>${m.title}</b></td>
            <td data-label="Attached to">Term ${(m.lesson ?? m.assignment).term} · ${m.lesson ? `${m.lesson.code} ${m.lesson.title}` : `Project · ${m.assignment.title}`}</td>
            <td data-label="File"><span class="mono small">${m.file_path}</span><br><span class="small muted">${fmtBytes(m.size_bytes)}</span></td>
            <td data-label=""><button class="btn ghost sm" type="button" data-remove="${m.id}" data-title="${m.title}">${icon('trash')} Remove</button></td></tr>`)}</tbody>
        </table></div>` : html`<p class="empty"><b>No PDFs attached${termNo ? ' in this term' : ''}</b>Upload one above.</p>`}
      </section>
      ${mats.unattached_files.length ? html`<section class="card" aria-labelledby="h-loose"><h2 id="h-loose">Uploaded but not attached</h2>
        <p class="sub">Students can’t see these. Delete them, or upload again and attach.</p>
        <div class="list">${mats.unattached_files.map((f) => html`<div class="item"><div class="meta"><b class="mono">${f.name}</b><span>${f.size_bytes ? fmtBytes(f.size_bytes) : ''} · ${fmtDateTime(f.created_at)}</span></div>
          <button class="btn ghost sm" type="button" data-delete="${f.name}">${icon('trash')} Delete file</button></div>`)}</div></section>` : ''}
    </div>`);

  for (const s of $$('[data-filter] select', ctx.main)) {
    s.addEventListener('change', () => ctx.go(hashFor($('#m-program', ctx.main).value, Number($('#m-term', ctx.main).value))));
  }
  const form = $('[data-upload]', ctx.main);
  onSubmit(form, async () => {
    const target = $('#u-target', form);
    const title = $('#u-title', form).value.trim();
    const file = $('#u-file', form).files[0];
    if (!target.value) throw problem('Choose the lesson or project to attach the PDF to.', '#u-target');
    if (!title) throw problem('Give the PDF a title. Students see it next to the download button.', '#u-title');
    const bad = pdfProblem(file);
    if (bad) throw problem(bad, '#u-file');
    const [kind, id] = target.value.split(':');
    const folder = kind === 'lesson' ? `lessons/${target.selectedOptions[0].dataset.code.toLowerCase()}` : `assignments/${id}`;
    const path = `${program}/${folder}/${slug(file.name)}-${stamp()}.pdf`;
    await uploadPdf(path, file);
    try {
      await rpc('admin_add_material', { p_file_path: path, p_title: title, p_lesson: kind === 'lesson' ? id : null, p_assignment_template: kind === 'project' ? id : null });
    } catch (e) {
      await removeFiles([path]).catch(() => {});   // don't leave an unattached file behind
      throw e;
    }
    await ctx.refresh();
    return `“${title}” uploaded. Students of that term can download it now.`;
  });
  for (const b of $$('[data-remove]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: `Remove “${b.dataset.title}”?`, confirm: 'Remove PDF', danger: true,
        body: html`<p>Students stop seeing it at once, and the file is deleted.</p>`,
        action: () => rpc('admin_remove_material', { p_material: b.dataset.remove }),
      });
      if (!r) return;
      const gone = await removeFiles([r.file_path]).catch(() => []);
      toast(gone.includes(r.file_path) ? `“${b.dataset.title}” removed and deleted.` : `“${b.dataset.title}” removed. The file is still listed under “Uploaded but not attached”.`);
      await ctx.refresh();
    });
  }
  for (const b of $$('[data-delete]', ctx.main)) {
    b.addEventListener('click', async () => {
      const r = await dialog({
        title: 'Delete this file?', confirm: 'Delete file', danger: true, body: html`<p class="mono">${b.dataset.delete}</p>`,
        action: async () => { const gone = await removeFiles([b.dataset.delete]); if (!gone.length) throw problem('The file could not be deleted. It may be attached to a lesson or project.'); return gone; },
      });
      if (r) { toast('File deleted.'); await ctx.refresh(); }
    });
  }
}

