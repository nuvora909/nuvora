// "Find my program": runs the question flow in every [data-finder] form, shows the calculated match with its
// reasons, and (on /find-your-program/) the term-by-term learning path. Answers live in sessionStorage for this
// visit; they are saved on the device only if the visitor ticks "Save this plan".
import { CATALOG } from './catalog.mjs';
import { QUESTIONS, BACHELOR_Q, recommend, MAX_PARTS, label } from './match.mjs';
import { nextStarts, termDates, fmtDay, isoDay } from './dates.mjs';
import { store, PLAN_KEY, savedPlan } from './site.js';

const P = (id) => CATALOG.programs.find((p) => p.id === id);
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const SESSION_KEY = 'nuvora.answers';
const ICON = {
  check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  warn: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z M12 10v4 M12 17v.5"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14 M13 6l6 6-6 6"/></svg>',
  down: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; } },
  set(v) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch { /* ignore */ } },
  del() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } },
};

function questionHtml(q, value) {
  const three = q.options.length === 3 || q.options.length === 2;
  return `<fieldset class="f-q"><legend>${esc(q.q)}</legend><div class="f-opts${three ? ' three' : ''}">${q.options.map(([v, l]) =>
    `<label class="f-opt"><input type="radio" name="${q.id}" value="${v}"${value === v ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
}

export function resultHtml(answers, result, { mode }) {
  const m = result.match;
  const p = P(m.id);
  const alt = result.alternatives.map((a) => `<a href="${P(a.id).url}">${esc(P(a.id).name)}</a> (${a.score}%)`).join(' · ');
  const answered = [...QUESTIONS, BACHELOR_Q].filter((q) => answers[q.id]).length;
  return `<div class="f-result"${mode === 'full' ? ' id="result"' : ''} tabindex="-1">
    <span class="eyebrow">Your Nuvora match</span>
    <div class="f-match">
      <span class="ring" style="--v:${m.score}" role="img" aria-label="${m.score}% match"><b>${m.score}%<small>match</small></b></span>
      <div><h3><a href="${p.url}">${esc(p.name)}</a></h3><p class="small muted">${esc(p.levelLabel)} · ${esc(p.duration)} · ${esc(p.weeklyHours)} hrs/week</p></div>
    </div>
    <ul class="f-why" aria-label="Why this program">
      ${m.reasons.map((r) => `<li class="ok">${ICON.check}<span>${esc(r)}</span></li>`).join('')}
      ${m.cautions.map((r) => `<li class="warn">${ICON.warn}<span>${esc(r)}</span></li>`).join('')}
    </ul>
    <details class="f-breakdown"><summary>How this ${m.score}% is calculated</summary>
      <p>Calculated from your ${answered} answers with fixed, published rules, not by predicting your results.</p>
      <table><tbody>
        <tr><th scope="row">Fits your goal (${esc(label('goal', answers.goal))})</th><td>${m.parts.goal} / ${MAX_PARTS.goal}</td></tr>
        <tr><th scope="row">Fits your background</th><td>${m.parts.role} / ${MAX_PARTS.role}</td></tr>
        <tr><th scope="row">Prerequisites</th><td>${m.parts.prereq} / ${MAX_PARTS.prereq}</td></tr>
        <tr><th scope="row">Weekly time (${esc(label('hours', answers.hours))})</th><td>${m.parts.time} / ${MAX_PARTS.time}</td></tr>
      </tbody></table></details>
    ${alt ? `<p class="f-alt">Also consider: ${alt}</p>` : ''}
    <div class="row">
      ${mode === 'full'
        ? `<a class="btn gold" href="#path" data-show-path>See my learning path ${ICON.arrow}</a>`
        : `<a class="btn gold" href="/find-your-program/#result" data-cta="finder-path">See my learning path ${ICON.arrow}</a>`}
      <a class="btn ghost" href="${p.url}">View program</a>
    </div>
    <button type="button" class="f-back" data-restart>Start over</button>
  </div>`;
}

export function pathHtml(programId, startIso) {
  const p = P(programId);
  const starts = nextStarts(3);
  const start = starts.find((s) => isoDay(s.start) === startIso)?.start ?? starts[0].start;
  const rows = termDates(start, p.termCount);
  const last = rows[rows.length - 1];
  return `<div class="stack" style="gap:18px">
    <div class="row" style="justify-content:space-between">
      <div><span class="eyebrow">Your learning path</span><h2 style="margin-top:8px">${esc(p.name)}</h2>
        <p class="muted">${p.termCount} ${p.termCount === 1 ? 'term' : 'terms'} · about ${esc(p.weeklyHours)} hours a week · finishes around ${fmtDay(last.end)}</p></div>
      <label class="field" style="min-width:220px"><span class="flabel">Start date</span>
        <select data-path-start>${starts.map((s) => `<option value="${isoDay(s.start)}"${isoDay(s.start) === isoDay(start) ? ' selected' : ''}>${fmtDay(s.start)} (apply by ${fmtDay(s.applyBy)})</option>`).join('')}</select></label>
    </div>
    <ol class="terms" style="list-style:none;padding:0">
      ${rows.map((r, i) => {
        const t = p.terms[i];
        return `<li><details class="term"${i === 0 ? ' open' : ''}><summary><span class="tn">${r.term}</span><span><b>${esc(t.title)}</b><br><span><time datetime="${isoDay(r.start)}">${fmtDay(r.start)}</time> to <time datetime="${isoDay(r.end)}">${fmtDay(r.end)}</time></span></span>${ICON.down}</summary>
          <div class="tbody"><div><h4>Lessons</h4><ul>${t.lessons.map(([c, l]) => `<li><span class="mono">${esc(c)}</span><span>${esc(l)}</span></li>`).join('')}</ul></div>
          <div><h4>Projects</h4><ul>${t.projects.map(([l, d]) => `<li><span>${esc(l)}</span><span class="due">week ${Math.ceil(d / 7)}</span></li>`).join('')}</ul></div></div></details></li>`;
      }).join('')}
    </ol>
    <div class="tablewrap"><table style="min-width:0"><tbody>
      <tr><th scope="row">Tuition</th><td>${money(p.tuition.perTerm)} per term × ${p.termCount} = <b>${money(p.tuition.total)}</b>, paid one term at a time</td></tr>
      <tr><th scope="row">Application fee</th><td>${money(p.tuition.applicationFee)}, once</td></tr>
      <tr><th scope="row">Live sessions</th><td>${esc(CATALOG.schedule.classDay)}s ${esc(CATALOG.schedule.classTime)} IST and ${esc(CATALOG.schedule.officeDay)}s ${esc(CATALOG.schedule.officeTime)} IST, on Zoom</td></tr>
    </tbody></table></div>
    <div class="row">
      <a class="btn gold" href="/admissions/?program=${p.id}&amp;start=${isoDay(start)}#request">Request a seat for ${fmtDay(start)} ${ICON.arrow}</a>
      <a class="btn ghost" href="${p.url}">View program</a>
    </div>
  </div>`;
}

function mount(form) {
  const mode = form.dataset.mode;
  const body = form.querySelector('[data-f-body]');
  const foot = form.querySelector('.f-foot');
  const bars = [...form.querySelectorAll('.f-steps i')];
  let answers = {};
  let step = 0;

  const flow = () => {
    const qs = [...QUESTIONS];
    if (QUESTIONS.every((q) => answers[q.id])) {
      const r = recommend({ ...answers, bachelor: answers.bachelor }, CATALOG.programs);
      if (r.needs === 'bachelor' || answers.bachelor) qs.push(BACHELOR_Q);
    }
    return qs;
  };

  const showQuestion = () => {
    const qs = flow();
    const q = qs[step];
    bars.forEach((b, i) => b.classList.toggle('done', i <= step));
    body.innerHTML = questionHtml(q, answers[q.id]) + (step > 0 ? '<div class="f-nav"><button type="button" class="f-back" data-back>← Back</button></div>' : '');
    if (foot) foot.hidden = false;
  };

  const finish = (focus = true) => {
    const result = recommend(answers, CATALOG.programs);
    if (result.needs === 'bachelor') { step = QUESTIONS.length; showQuestion(); return; }
    bars.forEach((b) => b.classList.add('done'));
    body.innerHTML = resultHtml(answers, result, { mode });
    if (foot) foot.hidden = true;
    session.set({ answers, match: result.match.id, score: result.match.score });
    if (focus) body.querySelector('.f-result').focus({ preventScroll: mode === 'compact' });
    document.dispatchEvent(new CustomEvent('nuvora:match', { detail: { answers, result } }));
  };

  form.addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    answers[e.target.name] = e.target.value;
    // Changing an earlier answer can change whether the degree question applies.
    if (e.target.name !== 'bachelor' && step < QUESTIONS.length) delete answers.bachelor;
    setTimeout(() => {
      const qs = flow();
      if (step < qs.length - 1) { step += 1; showQuestion(); body.querySelector('input')?.focus(); }
      else finish();
    }, 180);
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { step = Math.max(0, step - 1); showQuestion(); body.querySelector('input')?.focus(); }
    if (e.target.closest('[data-restart]')) { answers = {}; step = 0; session.del(); showQuestion(); body.querySelector('input')?.focus(); }
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  // Resume this visit's answers (e.g. after "See my learning path" from the home page).
  const prev = session.get() ?? (mode === 'full' ? savedPlan() : null);
  if (prev?.answers && QUESTIONS.every((q) => prev.answers[q.id])) { answers = { ...prev.answers }; step = flow().length - 1; finish(false); }
  else showQuestion();
}

// ---------- the full page: learning path and saving the plan ----------
function mountPath() {
  const host = document.querySelector('[data-path]');
  if (!host) return;
  const saveBox = document.querySelector('[data-save-plan]');
  const forget = document.querySelector('[data-forget-plan]');
  let current = null;
  const render = (programId, startIso) => {
    current = { programId, startIso };
    host.innerHTML = pathHtml(programId, startIso);
    host.closest('section').hidden = false;
  };
  document.addEventListener('nuvora:match', (e) => {
    const { answers, result } = e.detail;
    render(result.match.id);
    if (saveBox?.checked) persist(answers, result);
  });
  host.addEventListener('change', (e) => { if (e.target.matches('[data-path-start]')) render(current.programId, e.target.value); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-show-path]')) return;
    e.preventDefault();
    host.closest('section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    host.querySelector('h2')?.setAttribute('tabindex', '-1');
    host.querySelector('h2')?.focus({ preventScroll: true });
  });
  const persist = (answers, result) => store.set(PLAN_KEY, { v: 1, savedAt: Date.now(), answers, match: result.match.id, matchName: P(result.match.id).name, score: result.match.score });
  if (saveBox) {
    saveBox.checked = Boolean(savedPlan());
    saveBox.addEventListener('change', () => {
      const s = session.get();
      if (saveBox.checked && s?.answers) persist(s.answers, recommend(s.answers, CATALOG.programs));
      if (!saveBox.checked) store.del(PLAN_KEY);
    });
  }
  forget?.addEventListener('click', () => {
    store.del(PLAN_KEY); session.del();
    if (saveBox) saveBox.checked = false;
    forget.textContent = 'Plan forgotten';
  });
  if (location.hash === '#result' || location.hash === '#path') {
    requestAnimationFrame(() => document.querySelector('#result')?.scrollIntoView());
  }
}

mountPath();
document.querySelectorAll('form[data-finder]').forEach(mount);
