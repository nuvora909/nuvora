// Free sample lesson (/learn/sample-lesson/): the interactive gradient-descent chart and a practice check that is
// not graded. The pure helpers below are also imported by web/pages/learn.mjs at build time, so the page ships with
// the same chart, numbers and questions and can be read without JavaScript. Nothing here is stored or sent.

export const START = 2.6; // where descent starts on f(x) = x²
export const MAX_STEPS = 10;
const LIMIT = 3.4; // the chart shows x from −3.4 to 3.4
export const LR = { min: 0.05, max: 1.05, step: 0.05, initial: 0.2 };
export const PRESETS = [[0.05, 'Too small'], [0.25, 'Steady'], [0.5, 'One step'], [0.95, 'Zigzag'], [1.05, 'Too large']];

export const QUESTIONS = [
  {
    q: 'For f(x) = x², what is the gradient (the slope) at x = 2?',
    options: ['2', '4', '8'],
    answer: 1,
    why: 'The derivative of x² is 2x, so at x = 2 the slope is 2 × 2 = 4.',
  },
  {
    q: 'With learning rate η = 0.25 and x = 2, where does one step of x ← x − η · f′(x) take you?',
    options: ['x = 1', 'x = 1.5', 'x = 0'],
    answer: 0,
    why: 'The slope at x = 2 is 4, so the step is 0.25 × 4 = 1, and x moves from 2 to 2 − 1 = 1.',
  },
  {
    q: 'What happens when the learning rate is too large?',
    options: ['Training gets slower but stays stable', 'Steps overshoot the minimum and can diverge', 'Nothing changes'],
    answer: 1,
    why: 'A large step jumps past the minimum. For f(x) = x², any η above 1 lands further away every time, so the loss grows. Try 1.05 in the chart.',
  },
];

export const round2 = (n) => Math.round(Number(n) * 100) / 100;
const minus = (s) => s.replace('-', '−');
// Fixed decimals with a real minus sign; tiny values print as 0 rather than −0.000.
export const num = (n, d = 3) => minus((Math.abs(n) < 0.5 * 10 ** -d ? 0 : n).toFixed(d));
const lossText = (v) => (v < 0.0001 ? 'less than 0.0001' : v.toFixed(4));

// Up to MAX_STEPS updates x ← x − η·2x. Stops early on the exact minimum, or when a step leaves the chart.
export function descend(lr) {
  const xs = [START];
  let escaped = null;
  for (let i = 0; i < MAX_STEPS; i++) {
    const x = xs[xs.length - 1];
    const next = x - lr * 2 * x;
    if (Math.abs(next) > LIMIT) { escaped = next; break; }
    xs.push(next);
    if (Math.abs(next) < 1e-12) break;
  }
  return { xs, escaped };
}

// One sentence on what this learning rate does, for the live readout.
export function readout(value) {
  const lr = round2(value);
  const { xs } = descend(lr);
  const n = xs.length - 1;
  const last = xs[n];
  const e = `η = ${lr.toFixed(2)}`;
  const start = `${num(START, 1)}`;
  if (lr > 1) return `${e} is too large. Every step overshoots the minimum by more than the one before, so the loss grows instead of shrinking, and by step ${n + 1} x has left the chart. This is divergence.`;
  if (lr === 1) return `${e} jumps from x to exactly −x every time, so the steps bounce between ${start} and ${minus(`-${start}`)} and never get closer. The loss stays at ${num(START * START, 2)}.`;
  if (lr > 0.5) return `${e} overshoots: every step lands on the other side of the minimum, so x zigzags. The jumps still shrink, and after ${n} steps the loss is ${lossText(last * last)}${lr >= 0.9 ? ', which is slow progress' : ''}.`;
  if (lr === 0.5) return `${e} lands exactly on the minimum in one step, because ${start} − 0.5 × ${num(2 * START, 1)} = 0. That only happens with a loss this simple.`;
  return `${e} moves x steadily downhill from one side. After ${n} steps the loss is ${lossText(last * last)}, down from ${num(START * START, 2)}${lr < 0.1 ? '. Stable, but slow' : ''}.`;
}

// What happened at step k (0 = the start), for stepping through one update at a time.
export function stepText(value, k) {
  const lr = round2(value);
  const { xs, escaped } = descend(lr);
  if (k === 0) return `Start: x = ${num(START)} and the loss is ${num(START * START)}. Press Next step to take the first step.`;
  const prev = k - 1 < xs.length ? xs[k - 1] : null;
  const cur = k < xs.length ? xs[k] : escaped;
  const slope = 2 * prev;
  const factor = slope < 0 ? `(${num(slope)})` : num(slope); // x − η × (−s) reads more clearly with brackets
  const head = `Step ${k}: the slope at x = ${num(prev)} is ${num(slope)}, so x moves to ${num(prev)} − ${lr.toFixed(2)} × ${factor} = ${num(cur)}.`;
  if (k >= xs.length) return `${head} That is off the chart, and the loss has grown to ${num(cur * cur)}. This is divergence.`;
  return `${head} The loss is now ${num(cur * cur)}.`;
}

// Total steps a learner can step through, including the one that leaves the chart.
export const stepCount = (value) => {
  const { xs, escaped } = descend(round2(value));
  return xs.length - 1 + (escaped === null ? 0 : 1);
};

// Rows for the "numbers behind the chart" table: step, x, slope 2x, loss x².
export function stepRows(value) {
  const { xs, escaped } = descend(round2(value));
  const rows = xs.map((x, k) => [String(k), x]);
  if (escaped !== null) rows.push([`${xs.length} (off the chart)`, escaped]);
  return rows.map(([k, x]) => [k, num(x), num(2 * x), num(x * x)]);
}

// ---------- the chart (inner SVG markup; numbers only, so it is safe to inject) ----------
const MID = 220, BASE = 244, TOP = 34;
const SX = (MID - 34) / LIMIT;
const SY = (BASE - TOP) / (LIMIT * LIMIT);
const X = (x) => +(MID + x * SX).toFixed(1);
const Y = (y) => +(BASE - y * SY).toFixed(1);

export function svgMarkup(value, { uid = 'gd', shown = Infinity } = {}) {
  const lr = round2(value);
  const { xs, escaped } = descend(lr);
  const last = Math.min(shown, xs.length - 1);
  const o = [];
  o.push(`<defs><linearGradient id="${uid}-c" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset=".5" stop-color="#0866FF"/><stop offset="1" stop-color="#6D5DF6"/></linearGradient>`
    + `<marker id="${uid}-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="lrn-gd-head" d="M0 1L9 5L0 9z"/></marker></defs>`);
  for (let i = -3; i <= 3; i++) {
    o.push(`<line class="lrn-gd-grid" x1="${X(i)}" x2="${X(i)}" y1="${TOP - 8}" y2="${BASE}"/><text x="${X(i)}" y="${BASE + 20}" text-anchor="middle">${minus(String(i))}</text>`);
  }
  for (const y of [4, 8]) o.push(`<line class="lrn-gd-grid" x1="${X(-LIMIT)}" x2="${X(LIMIT)}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${X(-LIMIT) - 6}" y="${Y(y) + 4}" text-anchor="end">${y}</text>`);
  o.push(`<line class="lrn-gd-axis" x1="${X(-LIMIT)}" x2="${X(LIMIT)}" y1="${BASE}" y2="${BASE}"/><text x="${X(LIMIT) + 8}" y="${BASE + 4}">x</text>`);
  const curve = [];
  for (let i = 0; i <= 68; i++) { const x = -LIMIT + i * 0.1; curve.push(`${X(x)},${Y(x * x)}`); }
  o.push(`<polyline class="lrn-gd-curve" stroke="url(#${uid}-c)" points="${curve.join(' ')}"/>`);
  o.push(`<text class="lrn-gd-label" x="${X(-LIMIT)}" y="${TOP - 16}">loss f(x) = x²</text>`);
  // The slope at the start, as a short tangent line.
  const s = 2 * START, d = 0.42;
  o.push(`<line class="lrn-gd-tangent" x1="${X(START - d)}" y1="${Y(START * START - s * d)}" x2="${X(START + d)}" y2="${Y(START * START + s * d)}"/>`
    + `<text class="lrn-gd-note" x="${X(START) + 12}" y="${Y(START * START) + 22}">slope ${num(s, 1)}</text>`);
  for (let i = 1; i <= last; i++) {
    const [x1, y1, x2, y2] = [X(xs[i - 1]), Y(xs[i - 1] ** 2), X(xs[i]), Y(xs[i] ** 2)];
    const long = Math.hypot(x2 - x1, y2 - y1) > 14;
    o.push(`<line class="lrn-gd-step" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${long ? ` marker-end="url(#${uid}-a)"` : ''}/>`);
  }
  if (escaped !== null && shown > xs.length - 1) {
    const from = xs[xs.length - 1];
    const edge = escaped > 0 ? LIMIT : -LIMIT;
    o.push(`<line class="lrn-gd-step lrn-gd-off" x1="${X(from)}" y1="${Y(from * from)}" x2="${X(edge)}" y2="${TOP - 6}" marker-end="url(#${uid}-a)"/>`
      + `<text class="lrn-gd-warn" x="${X(LIMIT)}" y="${TOP - 16}" text-anchor="end">diverging: off the chart</text>`);
  }
  xs.slice(0, last + 1).forEach((x, i) => {
    const [cls, r] = i === 0 ? ['lrn-gd-start', 6.5] : i === last ? ['lrn-gd-end', 7.5] : ['lrn-gd-pt', 4.5];
    o.push(`<circle class="${cls}" cx="${X(x)}" cy="${Y(x * x)}" r="${r}"/>`);
  });
  o.push(`<text class="lrn-gd-label" x="${X(START) + 12}" y="${Y(START * START) + 4}">start</text>`);
  if (last > 0) {
    const e = xs[last];
    o.push(`<text class="lrn-gd-label" x="${X(e)}" y="${Y(e * e) - 13}" text-anchor="middle">${escaped !== null && shown > xs.length - 1 ? 'last' : 'end'}</text>`);
  }
  return o.join('');
}

// ---------- browser behaviour ----------
const ICONS = { ok: 'M5 12l5 5L20 7', no: 'M6 6l12 12 M18 6L6 18' };
const svgIcon = (kind) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONS[kind]}"/></svg>`;

function initDemo(root) {
  const svg = root.querySelector('[data-gd-svg]');
  const range = root.querySelector('[data-gd-lr]');
  const value = root.querySelector('[data-gd-value]');
  const read = root.querySelector('[data-gd-readout]');
  const presets = [...root.querySelectorAll('[data-gd-preset]')];
  const play = root.querySelector('[data-gd-play]');
  const next = root.querySelector('[data-gd-next]');
  const all = root.querySelector('[data-gd-all]');
  const rows = root.querySelector('[data-gd-rows]');
  const caption = root.querySelector('[data-gd-caption]');
  const uid = svg.dataset.gdSvg;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let shown = Infinity;
  let timer = null;

  const lr = () => round2(range.value);
  const draw = () => { svg.innerHTML = svgMarkup(lr(), { uid, shown }); };
  const stopPlay = () => { clearTimeout(timer); timer = null; play.setAttribute('aria-pressed', 'false'); };
  const syncNext = () => {
    const total = stepCount(lr());
    next.textContent = shown !== Infinity && shown >= total ? 'Start again' : 'Next step';
  };
  const showStep = (k) => {
    shown = k;
    draw();
    read.textContent = stepText(lr(), k);
    syncNext();
  };
  const showAll = () => {
    shown = Infinity;
    draw();
    read.textContent = readout(lr());
    syncNext();
  };

  function update() {
    stopPlay();
    const v = lr();
    const label = v.toFixed(2);
    value.textContent = label;
    range.setAttribute('aria-valuetext', `η = ${label}`);
    for (const b of presets) b.setAttribute('aria-pressed', String(round2(b.dataset.gdPreset) === v));
    rows.replaceChildren(...stepRows(v).map((cells) => {
      const tr = document.createElement('tr');
      cells.forEach((c, i) => {
        const cell = document.createElement(i ? 'td' : 'th');
        if (!i) cell.scope = 'row';
        cell.textContent = c;
        tr.append(cell);
      });
      return tr;
    }));
    caption.textContent = `The numbers behind the chart at η = ${label}`;
    showAll();
  }

  range.addEventListener('input', update);
  presets.forEach((b) => b.addEventListener('click', () => { range.value = b.dataset.gdPreset; update(); }));
  next.addEventListener('click', () => {
    stopPlay();
    const total = stepCount(lr());
    showStep(shown === Infinity || shown >= total ? 0 : shown + 1);
  });
  all.addEventListener('click', () => { stopPlay(); showAll(); });
  // Play animates the steps one by one. It is hidden when the visitor prefers reduced motion; Next step does the
  // same thing at the visitor's own pace.
  play.addEventListener('click', () => {
    if (timer) { stopPlay(); return; }
    const total = stepCount(lr());
    play.setAttribute('aria-pressed', 'true');
    showStep(0);
    const tick = () => {
      if (shown >= total) { stopPlay(); showAll(); return; }
      showStep(shown + 1);
      timer = setTimeout(tick, 650);
    };
    timer = setTimeout(tick, 650);
  });
  const motion = () => { play.hidden = reduce.matches; if (reduce.matches) stopPlay(); };
  reduce.addEventListener?.('change', motion);

  root.querySelectorAll('[data-gd-js]').forEach((el) => { el.hidden = false; });
  motion();
  update();
}

const VERDICT = [
  ['Worth another look', 'Read the explanation under each question, try the presets in the chart, then check again.'],
  ['One out of three', 'Read the explanations for the two you missed, try those learning rates in the chart, then check again.'],
  ['Two out of three', 'Read the explanation for the one you missed, then try that learning rate in the chart.'],
  ['All three correct', 'You have the core idea: step against the slope, and choose the step size with care.'],
];

function initQuiz(form) {
  const out = form.querySelector('[data-quiz-out]');
  const reset = form.querySelector('[data-quiz-reset]');
  const sets = [...form.querySelectorAll('fieldset[data-q]')];

  const clear = (fs) => {
    const fb = fs.querySelector('[data-fb]');
    fb.hidden = true;
    fb.className = 'lrn-fb';
    fb.replaceChildren();
    fs.querySelectorAll('.f-opt').forEach((l) => l.classList.remove('lrn-right', 'lrn-wrong', 'lrn-answer'));
  };

  form.addEventListener('change', (e) => {
    const fs = e.target.closest('fieldset[data-q]');
    if (fs) clear(fs);
    out.replaceChildren();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const picks = sets.map((fs) => { const c = fs.querySelector('input:checked'); return c ? Number(c.value) : null; });
    const missing = picks.indexOf(null);
    if (missing >= 0) {
      const p = document.createElement('p');
      p.className = 'err';
      p.setAttribute('role', 'alert');
      p.textContent = `Answer all three questions, then check again. Question ${missing + 1} is still open.`;
      out.replaceChildren(p);
      sets[missing].querySelector('input').focus();
      return;
    }
    let score = 0;
    sets.forEach((fs, i) => {
      const q = QUESTIONS[i];
      const ok = picks[i] === q.answer;
      if (ok) score += 1;
      fs.querySelector(`input[value="${picks[i]}"]`).closest('.f-opt').classList.add(ok ? 'lrn-right' : 'lrn-wrong');
      // After a miss, outline the right option too; the feedback text below names it, so colour is not the only cue.
      if (!ok) fs.querySelector(`input[value="${q.answer}"]`).closest('.f-opt').classList.add('lrn-answer');
      const fb = fs.querySelector('[data-fb]');
      fb.className = `lrn-fb ${ok ? 'ok' : 'no'}`;
      fb.innerHTML = svgIcon(ok ? 'ok' : 'no');
      const text = document.createElement('span');
      const lead = document.createElement('b');
      lead.textContent = ok ? 'Correct. ' : `Not quite: the answer is ${q.options[q.answer]}. `;
      text.append(lead, q.why);
      fb.append(text);
      fb.hidden = false;
    });
    const [title, advice] = VERDICT[score];
    const box = document.createElement('div');
    box.className = 'lrn-score';
    box.tabIndex = -1;
    box.innerHTML = `<span class="ring" style="--v:${Math.round((score / QUESTIONS.length) * 100)}"><b></b></span><div class="stack" style="gap:6px"><h3></h3><p></p><p class="small muted">Practice only: not graded, and your answers are not saved or sent anywhere.</p></div>`;
    box.querySelector('.ring b').textContent = `${score}/${QUESTIONS.length}`;
    box.querySelector('h3').textContent = title;
    box.querySelector('p').textContent = advice;
    out.replaceChildren(box);
    reset.hidden = false;
    box.focus();
  });

  form.addEventListener('reset', () => {
    // The browser clears the radios after this event, so tidy up on the next tick.
    setTimeout(() => {
      sets.forEach(clear);
      out.replaceChildren();
      reset.hidden = true;
      sets[0].querySelector('input').focus();
    });
  });

  form.querySelectorAll('[data-quiz-js]').forEach((el) => { el.hidden = false; });
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-gd]').forEach(initDemo);
  document.querySelectorAll('[data-quiz]').forEach(initQuiz);
}
