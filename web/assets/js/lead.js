// Seat request form on /admissions/ (form[data-seat-form]).
// Prefills from ?program=<id>&start=<iso> and the visitor's saved plan, validates in the browser with inline errors
// and an error summary, and sends the request to the request_seat database function. Nothing else: the details
// are sent to that one endpoint only, are never put in a URL, and are never stored in the browser.
//
// Contract: POST {supabaseUrl}/rest/v1/rpc/request_seat
//   { p_program, p_start, p_full_name, p_email, p_country, p_consent, p_consent_version, p_phone?, p_details?, p_source }
//   p_details is a flat object of short values (the saved plan's answers, match and score). It is sent only when a
//   plan was saved on this device and the visitor ticks "include" (it starts unticked).
//   200 -> { ok: true } for every accepted request, new or a repeat of an earlier one
//   400 -> { code: "22023", message: "<friendly message>" }
// Every accepted request gets the same "Request received" message, built only from what this visitor typed: the
// page never shows a reference or anything else that could reveal whether the same request was sent before.
import { CATALOG } from './catalog.mjs';
import { nextStarts, termDates, fmtDay, fmtLong, isoDay, fromIso } from './dates.mjs';
import { savedPlan } from './site.js';

const FORM_STARTS = 3;
const TABLE_STARTS = 6;
const TIMEOUT_MS = 20000;
const EMAIL = /^[^\s@]{1,64}@([^\s@.]+\.)+[a-z]{2,63}$/i;
const PHONE = /^[0-9 +()-]{6,24}$/;
// Field limits match the request_seat() database function, so the browser and the database agree.
const LIMITS = { full_name: 80, email: 254, country: 56, phone: 24 };
// Saved plan answers that may be sent, and the names the database expects for them.
const PLAN_KEYS = { role: 'role', goal: 'goal', hours: 'hours', coding: 'coding', bachelor: 'has_bachelor' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const P = (id) => CATALOG.programs.find((p) => p.id === id);
const startLabel = ({ start, applyBy }) => `${fmtLong(start)} · requests close ${fmtDay(applyBy, { year: undefined })}`;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The database endpoint from /portal/config.js. Returns null when the site is not connected yet.
function endpoint() {
  const c = window.NUVORA_CONFIG;
  if (!c || typeof c.supabaseUrl !== 'string' || typeof c.anonKey !== 'string' || !c.anonKey) return null;
  if (/YOUR-PROJECT|YOUR-ANON-KEY/.test(`${c.supabaseUrl} ${c.anonKey}`)) return null;
  try {
    const u = new URL(c.supabaseUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  } catch { return null; }
  return { url: `${c.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/request_seat`, key: c.anonKey };
}

// ---------- start dates (the page may have been built days ago) ----------
function refreshStarts(select) {
  const keep = select.value;
  const starts = nextStarts(FORM_STARTS);
  select.replaceChildren(...starts.map((s) => new Option(startLabel(s), isoDay(s.start))));
  if (starts.some((s) => isoDay(s.start) === keep)) select.value = keep;
  return starts;
}

function refreshTable() {
  const starts = nextStarts(TABLE_STARTS);
  for (const el of document.querySelectorAll('time[data-adm-end]')) {
    const s = starts[Number(el.dataset.admEnd)];
    if (!s) continue;
    const end = termDates(s.start, 1)[0].end;
    el.dateTime = isoDay(end);
    el.textContent = fmtDay(end);
  }
}

// ---------- the form ----------
function mount(form) {
  const card = form.parentElement;
  const result = card.querySelector('[data-seat-result]');
  const submit = form.querySelector('[data-seat-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const status = form.querySelector('[data-seat-status]');
  const summary = form.querySelector('[data-error-summary]');
  const summaryTitle = summary.querySelector('[data-summary-title]');
  const summaryText = summary.querySelector('[data-summary-text]');
  const summaryList = summary.querySelector('[data-summary-list]');
  const prefillNote = form.querySelector('[data-prefill-note]');
  const programHint = form.querySelector('[data-program-hint]');
  const startHint = form.querySelector('[data-start-hint]');
  const planBox = form.querySelector('[data-plan-box]');
  const el = form.elements;
  const programDefaultHint = [...programHint.childNodes].map((n) => n.cloneNode(true));

  const api = endpoint();
  let sending = false;
  let attempted = false;   // after the first submit, fields re-check themselves as they change
  let plan = null;

  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = `adm-status${kind ? ` is-${kind}` : ''}`;
  };

  // ----- prefill -----
  const starts = refreshStarts(el.start);
  const params = new URLSearchParams(location.search);
  const notes = [];
  const wanted = params.get('program');
  if (wanted && P(wanted)) el.program.value = wanted;

  plan = savedPlan();
  if (plan && !P(plan.match)) plan = null;
  if (plan) {
    if (!el.program.value) {
      el.program.value = plan.match;
      notes.push('We chose the program from the plan you saved in Find my program. You can change it.');
    }
    planBox.querySelector('[data-plan-name]').textContent = P(plan.match).name;
    planBox.querySelector('[data-plan-meta]').textContent = Number.isFinite(plan.score) ? `(${plan.score}% match, saved on this device)` : '(saved on this device)';
    planBox.hidden = false;
  }

  const startParam = params.get('start');
  if (startParam && ISO.test(startParam)) {
    if (starts.some((s) => isoDay(s.start) === startParam)) el.start.value = startParam;
    else {
      const d = fromIso(startParam);
      if (!Number.isNaN(d.getTime())) {
        const last = starts[starts.length - 1].start;
        notes.push(d < starts[0].start
          ? `Requests for the ${fmtDay(d)} start are closed, so the next open start is selected.`
          : d > last
            ? `The ${fmtDay(d)} start is not open for requests yet. Choose one of the next ${FORM_STARTS} starts.`
            : `${fmtDay(d)} is not a batch start date. Choose one of the next ${FORM_STARTS} starts.`);
      }
    }
  }
  if (notes.length) { prefillNote.textContent = notes.join(' '); prefillNote.hidden = false; }

  // ----- hints that follow the selection -----
  const needs = (p) => (/^none\b/i.test(p.required[0] ?? '')
    ? `No prerequisites: ${p.required[0].replace(/^none\W*/i, '')}.`
    : `You need: ${p.required.join('; ')}.`);
  const showProgram = () => {
    const p = P(el.program.value);
    if (!p) { programHint.replaceChildren(...programDefaultHint.map((n) => n.cloneNode(true))); return; }
    const a = document.createElement('a');
    a.href = p.url;
    a.textContent = 'About this program';
    programHint.replaceChildren(
      `${p.levelLabel} · ${p.duration} · ${p.weeklyHours} hrs/week. ${needs(p)} `, a);
  };
  const showStart = () => {
    const iso = el.start.value;
    if (!ISO.test(iso)) return;
    const p = P(el.program.value);
    const term = termDates(fromIso(iso), 1)[0];
    const more = p && p.termCount > 1 ? ` The program continues term after term (${p.termCount} terms).` : '';
    const closes = new Date(term.start.getTime() - 7 * 86400000);
    startHint.textContent = `Requests close ${fmtDay(closes)}. Term 1 runs ${fmtDay(term.start)} to ${fmtDay(term.end)}.${more} Dates are in India time (IST).`;
  };
  showProgram();
  showStart();

  // ----- validation -----
  const RULES = {
    program: (v) => (!v ? 'Choose a program.' : !P(v) ? 'Choose a program from the list.' : ''),
    start: (v) => (!v || !ISO.test(v) ? 'Choose a start date.' : ''),
    full_name: (v) => (!v ? 'Enter your full name.' : v.length < 2 ? 'Enter your full name, as you would like Nuvora to address you.' : v.length > LIMITS.full_name ? `Use ${LIMITS.full_name} characters or fewer for your name.` : ''),
    email: (v) => (!v ? 'Enter your email address.' : v.length > LIMITS.email || !EMAIL.test(v) ? 'Enter a valid email address, with an @ and a domain such as .com.' : ''),
    country: (v) => (!v ? 'Enter the country you live in.' : v.length < 2 ? 'Enter the name of the country you live in.' : v.length > LIMITS.country ? `Use ${LIMITS.country} characters or fewer for the country.` : ''),
    phone: (v) => {
      if (!v) return '';
      const digits = v.replace(/\D/g, '').length;
      return !PHONE.test(v) || digits < 6 ? 'Enter a phone number using digits, spaces and + - ( ), starting with your country code, or leave it empty.' : '';
    },
    consent: (_v, input) => (input.checked ? '' : 'Tick the box to agree that Nuvora may store your details to reply to your request.'),
  };
  const ORDER = Object.keys(RULES);
  const value = (name) => (el[name].type === 'checkbox' ? el[name].checked : String(el[name].value ?? '').trim());

  function setError(name, message) {
    const input = el[name];
    const err = form.querySelector(`#${input.id}-err`);
    const hint = form.querySelector(`#${input.id}-hint`);
    const ids = [hint && hint.id, message && err.id].filter(Boolean);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
    input.closest('.adm-field').classList.toggle('is-invalid', Boolean(message));
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      const lead = document.createElement('span');
      lead.className = 'sr-only';
      lead.textContent = 'Error: ';
      err.replaceChildren(lead, message);
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.replaceChildren();
      err.hidden = true;
    }
  }

  const check = (name) => {
    const message = RULES[name](value(name), el[name]);
    setError(name, message);
    return message;
  };

  function showSummary({ title, text = '', errors = [] }) {
    summaryTitle.textContent = title;
    summaryText.textContent = text;
    summaryText.hidden = !text;
    summaryList.replaceChildren(...errors.map(([name, message]) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${el[name].id}`;
      a.dataset.focus = name;
      a.textContent = message;
      li.append(a);
      return li;
    }));
    summaryList.hidden = !errors.length;
    summary.hidden = false;
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  const hideSummary = () => { summary.hidden = true; summaryList.replaceChildren(); };

  summary.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-focus]');
    if (!a) return;
    e.preventDefault();
    const input = el[a.dataset.focus];
    input.closest('.adm-field').scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    input.focus({ preventScroll: true });
  });

  const recheck = (e) => {
    const name = e.target.name;
    if (name === 'program') { showProgram(); showStart(); }
    if (name === 'start') showStart();
    if (!RULES[name]) return;
    // Before the first submit, only clear errors; after it, re-check as the visitor fixes things.
    if (attempted || e.target.getAttribute('aria-invalid') === 'true') {
      check(name);
      if (attempted && !summary.hidden && ORDER.every((n) => !RULES[n](value(n), el[n]))) hideSummary();
    }
  };
  form.addEventListener('change', recheck);
  form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') recheck(e); });
  form.addEventListener('focusout', (e) => {
    // A filled-in field that is wrong is flagged when the visitor leaves it; empty fields wait for submit.
    const name = e.target.name;
    if (!attempted && RULES[name] && e.target.type !== 'checkbox' && value(name)) check(name);
  });

  // ----- start dates picked from the table -----
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-pick-start]');
    if (!a || result.hidden === false) return;
    const s = nextStarts(FORM_STARTS)[Number(a.dataset.pickStart)];
    if (!s) return;
    e.preventDefault();
    el.start.value = isoDay(s.start);
    showStart();
    if (attempted) check('start');
    document.getElementById('request').scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    (el.program.value ? el.full_name : el.program).focus({ preventScroll: true });
  });

  // ----- sending -----
  const setSending = (on) => {
    sending = on;
    submit.disabled = on;
    if (on) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
    submitLabel.textContent = on ? 'Sending…' : 'Send seat request';
  };

  function payload() {
    const body = {
      p_program: value('program'),
      p_start: value('start'),
      p_full_name: value('full_name').replace(/\s+/g, ' '),
      p_email: value('email'),
      p_country: value('country').replace(/\s+/g, ' '),
      p_consent: true,
      p_consent_version: CATALOG.consentVersion,
      p_source: location.pathname,
    };
    const phone = value('phone');
    if (phone) body.p_phone = phone;
    // The saved plan goes along only if one was saved on this device and the visitor kept the box ticked.
    if (plan && el.include_plan?.checked) {
      const details = {};
      for (const [key, name] of Object.entries(PLAN_KEYS)) {
        const v = plan.answers?.[key];
        if (typeof v === 'string' && v && v.length <= 64) details[name] = v;
      }
      details.match = plan.match;
      if (Number.isFinite(plan.score)) details.score = plan.score;
      body.p_details = details;
    }
    return body;
  }

  async function send(body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(api.url, {
        method: 'POST',
        headers: { apikey: api.key, Authorization: `Bearer ${api.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      let data = null;
      try { data = await res.json(); } catch { /* empty or not JSON */ }
      return { status: res.status, ok: res.ok, data };
    } catch {
      return { status: 0, ok: false, data: null };
    } finally {
      clearTimeout(timer);
    }
  }

  // The same confirmation for every accepted request, from the form's own values only.
  function showResult(body) {
    const p = P(body.p_program);
    const start = fromIso(body.p_start);
    const applyBy = new Date(start.getTime() - 7 * 86400000);
    const set = (key, text) => { result.querySelector(`[data-r="${key}"]`).textContent = text; };
    set('program', p?.name ?? body.p_program);
    set('start', fmtLong(start));
    set('applyBy', fmtDay(applyBy));
    set('email', body.p_email);
    const link = result.querySelector('[data-r-link="program"]');
    if (p) { link.href = p.url; link.hidden = false; link.setAttribute('aria-label', `View program: ${p.name}`); } else link.hidden = true;
    const title = result.querySelector('[data-result-title]');
    form.hidden = true;
    result.hidden = false;
    title.focus({ preventScroll: true });
    result.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending || !api) return;
    attempted = true;
    setStatus('');
    const errors = ORDER.map((name) => [name, check(name)]).filter(([, m]) => m);
    if (errors.length) {
      showSummary({ title: errors.length === 1 ? 'There is 1 problem to fix' : `There are ${errors.length} problems to fix`, errors });
      return;
    }
    hideSummary();
    const body = payload();
    setSending(true);
    setStatus('Sending your request…', 'busy');
    const res = await send(body);
    setSending(false);

    const r = Array.isArray(res.data) ? res.data[0] : res.data;
    // Any 2xx answer means the database accepted the request (validation problems come back as 400).
    if (res.ok && r && typeof r === 'object') {
      setStatus('');
      showResult(body);
      return;
    }
    if (res.status === 400 && r && r.code === '22023' && r.message) {
      setStatus('');
      showSummary({ title: 'Nuvora could not accept this request', text: String(r.message).slice(0, 300) });
      return;
    }
    const retry = res.status === 429
      ? 'Too many requests were sent from here in a short time. Your details are still in the form; please wait a few minutes and send again.'
      : res.status === 0 || res.status >= 500
        ? 'Your request was not sent: the connection failed or the service did not answer. Your details are still in the form; check your connection and send again.'
        : 'Your request could not be sent right now. Your details are still in the form; please try again in a few minutes.';
    setStatus(retry, 'error');
    submitLabel.textContent = 'Try again';
    submit.focus();
  });

  result.querySelector('[data-seat-again]').addEventListener('click', () => {
    // Keep the contact details for the next request; consent is asked again each time.
    el.consent.checked = false;
    attempted = false;
    for (const name of ORDER) setError(name, '');
    hideSummary();
    setStatus('');
    result.hidden = true;
    form.hidden = false;
    el.program.focus();
  });

  if (!api) {
    setStatus('The seat request form is not connected yet, so requests cannot be sent from this copy of the site.', 'error');
    return;
  }
  submit.disabled = false;
}

refreshTable();
document.querySelectorAll('form[data-seat-form]').forEach(mount);
