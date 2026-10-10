// The 3D preview of a program guide: a native dialog with a book drawn by CSS 3D transforms (no libraries, no
// WebGL). The front cover is the program's brochure art, the spine carries the wordmark and the short name, and the
// back cover lists the program's facts from the browser catalog. Visitors turn it by dragging (mouse, touch or pen),
// with the arrow keys, or with the buttons. A slow automatic turn plays for a few seconds (AUTO_MS), slows to a stop,
// and stops at once at the first interaction; it never plays with reduced motion. Only the book's and the floor
// shadow's transforms change while it moves.
//
// No printed or PDF guide exists yet, so the wording says what this is: the guide's design, with the facts from the
// program page on the back.
//
// Loaded on first use by site.js, together with its stylesheet, so nothing of it loads before a visitor asks.
import { CATALOG } from './catalog.mjs';
import { siteHref } from './site.js';

export const CREDENTIAL_LINE = 'Nuvora certificate of completion · not an accredited degree';
export const HINT = 'A 3D model of the program guide’s design, with facts from the program page. Drag or use the arrow keys to turn it.';

const PROGRAMS = CATALOG.programs;
const DEFAULT = { rx: -13, ry: -30 };   // a three-quarter view: front cover, page edges and a little of the top
const TILT = 38;                        // the most the book tips forward or back, so a cover always faces the visitor
const SPIN = 11;                        // automatic turn, degrees per second
const AUTO_MS = 5000;                   // how long it turns by itself; it slows to a stop over the last second
const DRAG = { x: 0.42, y: 0.32 };      // degrees per pixel dragged
const KEY_STEP = 15, KEY_TILT = 8, BUTTON_STEP = 45;

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugOf = (p) => String(p.url).split('/').filter(Boolean).at(-1);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** The angle folded into -180 to 180. */
const fold = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** The side of the book that faces the visitor at a turn of ry degrees (rotateY; positive turns the spine forward). */
export function facing(ry) {
  const a = fold(ry);
  if (Math.abs(a) <= 45) return 'Front cover';
  if (Math.abs(a) >= 135) return 'Back cover';
  return a > 0 ? 'Spine' : 'Page edges';
}

const CLOSE_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12 M18 6L6 18"/></svg>';
const RING = (cls) => `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="19" cy="23" r="13.5" fill="none" stroke="currentColor" stroke-width="6.5"/><circle class="dot" cx="34" cy="7" r="4.5"/></svg>`;
const WORDMARK = `<span class="p3d-wm" role="img" aria-label="Nuvora">nuv${RING('p3d-wm-o')}ra</span>`;

// The third item names the facts that the smallest books keep for screen readers only, for lack of room
// (preview3d.css): 'extra' below a 200px book, 'extra-2' (the level, which the program name also says) below 180px.
const facts = (p) => [
  ['Level', p.levelLabel, 'extra-2'],
  ['Duration', p.duration],
  ['Weekly hours', `${p.weeklyHours} hrs/week`, 'extra'],
  ['Tuition', `$${Number(p.tuition.perTerm).toLocaleString('en-US')} per term`],
  ['Terms', `${p.termCount} ${p.termCount === 1 ? 'term' : 'terms'}`, 'extra'],
];

let dialog, book, floor, stage, status, title, front, back, spineName, backLink, returnTo;
let state = { ...DEFAULT };
let frame = 0, last = 0;
let auto = false, autoT = 0, tween = null, spin = { x: 0, y: 0 }, drag = null;
let cssReady;

/** The stylesheet is loaded with the module, the first time a preview is opened. */
function loadStyles() {
  cssReady ??= new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = siteHref('/css/preview3d.css');
    link.dataset.preview3dCss = '';
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  });
  return cssReady;
}

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'p3d';
  dialog.setAttribute('aria-labelledby', 'p3d-title');
  dialog.setAttribute('aria-describedby', 'p3d-hint');
  dialog.innerHTML = `
  <div class="p3d-panel">
    <div class="p3d-head">
      <div class="p3d-titles">
        <p class="p3d-kicker">Program guide</p>
        <h2 id="p3d-title"></h2>
        <p id="p3d-hint" class="p3d-hint">${esc(HINT)}</p>
      </div>
      <button class="p3d-close" type="button" aria-label="Close 3D preview" data-p3d-close>${CLOSE_ICON}</button>
    </div>
    <div class="p3d-stage" tabindex="0" role="group" aria-roledescription="3D model" data-p3d-stage>
      <span class="p3d-halo" aria-hidden="true"></span>
      <span class="p3d-floor" aria-hidden="true" data-p3d-floor></span>
      <div class="p3d-scene">
        <div class="p3d-book" data-p3d-book>
          <div class="p3d-face p3d-front">
            <img alt="" width="480" height="640" decoding="async" data-p3d-front>
            <span class="p3d-sheen" aria-hidden="true"></span>
          </div>
          <div class="p3d-face p3d-spine" aria-hidden="true">
            <div class="p3d-spine-run">${WORDMARK}<span class="p3d-spine-name" data-p3d-spine></span>${RING('p3d-spine-mark')}</div>
          </div>
          <div class="p3d-face p3d-back" data-p3d-back></div>
          <span class="p3d-face p3d-fore" aria-hidden="true"></span>
          <span class="p3d-face p3d-top" aria-hidden="true"></span>
          <span class="p3d-face p3d-bottom" aria-hidden="true"></span>
        </div>
      </div>
    </div>
    <div class="p3d-foot">
      <p class="p3d-status" role="status" aria-live="polite" aria-atomic="true">Facing you: <b data-p3d-side>Front cover</b></p>
      <div class="p3d-controls" role="group" aria-label="Turn the model">
        <button class="btn ghost sm" type="button" data-p3d-turn="-1">Turn left</button>
        <button class="btn ghost sm" type="button" data-p3d-turn="1">Turn right</button>
        <button class="btn ghost sm" type="button" data-p3d-show="front">Show front</button>
        <button class="btn ghost sm" type="button" data-p3d-show="back">Show back</button>
        <button class="btn ghost sm" type="button" data-p3d-reset>Reset view</button>
      </div>
    </div>
  </div>`;

  title = dialog.querySelector('#p3d-title');
  stage = dialog.querySelector('[data-p3d-stage]');
  book = dialog.querySelector('[data-p3d-book]');
  floor = dialog.querySelector('[data-p3d-floor]');
  front = dialog.querySelector('[data-p3d-front]');
  back = dialog.querySelector('[data-p3d-back]');
  spineName = dialog.querySelector('[data-p3d-spine]');
  status = dialog.querySelector('.p3d-status');

  dialog.querySelector('[data-p3d-close]').addEventListener('click', closePreview);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closePreview(); });
  // A click on the backdrop closes it, but not the end of a drag that started on the model.
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dialog; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog && downOnBackdrop) closePreview(); });

  for (const b of dialog.querySelectorAll('[data-p3d-turn]')) {
    b.addEventListener('click', () => { interact(); turnBy(Number(b.dataset.p3dTurn)); });
  }
  dialog.querySelector('[data-p3d-show="front"]').addEventListener('click', () => { interact(); goTo({ rx: 0, ry: nearest(0) }); });
  dialog.querySelector('[data-p3d-show="back"]').addEventListener('click', () => { interact(); goTo({ rx: 0, ry: nearest(180) }); });
  dialog.querySelector('[data-p3d-reset]').addEventListener('click', () => { interact(); goTo({ rx: DEFAULT.rx, ry: nearest(DEFAULT.ry) }); });

  // Arrow keys turn the book while the model or one of its buttons has focus.
  const keyed = (e) => {
    const k = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[e.key];
    if (!k || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    interact();
    const target = tween?.to ?? state;
    if (k[1]) goTo({ rx: target.rx, ry: target.ry + k[1] * (e.shiftKey ? BUTTON_STEP : KEY_STEP) }, 260);
    else goTo({ rx: clamp(target.rx + k[0] * KEY_TILT, -TILT, TILT), ry: target.ry }, 260);
  };
  stage.addEventListener('keydown', keyed);
  dialog.querySelector('.p3d-controls').addEventListener('keydown', keyed);
  // Any key in the dialog (Tab too) stops the automatic turn, so nothing moves while the visitor finds their way.
  dialog.addEventListener('keydown', () => { if (auto) interact(); });
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Home') { e.preventDefault(); interact(); goTo({ rx: 0, ry: nearest(0) }); }
    if (e.key === 'End') { e.preventDefault(); interact(); goTo({ rx: 0, ry: nearest(180) }); }
  });

  pointer();
  document.body.append(dialog);
}

// ---------------------------------------------------------------- dragging, with gentle inertia
function pointer() {
  const SLOP = 4;   // pixels before a press becomes a drag, so a tap on the back-cover link still follows it
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    interact();
    tween = null;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false, vx: 0, vy: 0 };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      drag.moved = true;
      try { stage.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
      stage.classList.add('is-dragging');
    }
    const dt = Math.max(1, e.timeStamp - drag.t);
    const ddy = dx * DRAG.x, ddx = -dy * DRAG.y;
    state = { rx: clamp(state.rx + ddx, -TILT, TILT), ry: state.ry + ddy };
    // Velocity in degrees per millisecond, smoothed so one jittery sample does not fling the book.
    drag.vy = drag.vy * 0.6 + (ddy / dt) * 0.4;
    drag.vx = drag.vx * 0.6 + (ddx / dt) * 0.4;
    drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
    render();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, vx, vy, t } = drag;
    drag = null;
    stage.classList.remove('is-dragging');
    try { if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!moved) return;
    // A drag never also counts as a click on the back-cover link.
    const swallow = (c) => { c.preventDefault(); c.stopPropagation(); };
    stage.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => stage.removeEventListener('click', swallow, { capture: true }), 0);
    announce();
    // A flick keeps turning and slows to a stop; a drag that paused before release does not.
    if (reducedMotion() || e.timeStamp - t > 80) return;
    spin = { x: clamp(vx, -0.25, 0.25), y: clamp(vy, -0.5, 0.5) };   // at most about a third of a turn
    loop();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', (e) => { if (drag?.moved) end(e); });
}

// ---------------------------------------------------------------- motion
function interact() {
  endAuto();
  spin = { x: 0, y: 0 };
}

/** The automatic turn is over: from now on the live region names the side that faces the visitor. */
function endAuto() {
  if (!auto) return;
  auto = false;
  status.setAttribute('aria-live', 'polite');
}

/** The angle that equals `a` (mod 360) and is closest to the book's current turn, so it never spins the long way. */
function nearest(a) {
  const from = (tween?.to ?? state).ry;
  return from + fold(a - from);
}

function turnBy(dir) {
  const from = (tween?.to ?? state).ry;
  // Steps land on whole 45-degree views: front, three-quarter, spine or page edges, back.
  const ry = dir > 0 ? Math.floor(from / BUTTON_STEP + 1e-6) * BUTTON_STEP + BUTTON_STEP : Math.ceil(from / BUTTON_STEP - 1e-6) * BUTTON_STEP - BUTTON_STEP;
  goTo({ rx: (tween?.to ?? state).rx, ry });
}

function goTo(to, ms = 650) {
  if (reducedMotion()) { tween = null; state = { ...to }; render(); announce(); return; }
  tween = { from: { ...state }, to: { ...to }, start: performance.now(), ms };
  loop();
}

const ease = (t) => 1 - (1 - t) ** 3;

function step(now) {
  frame = 0;
  const dt = Math.min(64, now - (last || now));
  last = now;
  let more = false;
  if (tween) {
    const t = Math.min(1, (now - tween.start) / tween.ms);
    const k = ease(t);
    state = { rx: tween.from.rx + (tween.to.rx - tween.from.rx) * k, ry: tween.from.ry + (tween.to.ry - tween.from.ry) * k };
    if (t >= 1) { state = { ...tween.to }; tween = null; announce(); } else more = true;
  } else if (Math.abs(spin.x) > 0.002 || Math.abs(spin.y) > 0.002) {
    state = { rx: clamp(state.rx + spin.x * dt, -TILT, TILT), ry: state.ry + spin.y * dt };
    const decay = Math.exp(-dt / 220);
    spin = { x: spin.x * decay, y: spin.y * decay };
    if (state.rx === TILT || state.rx === -TILT) spin.x = 0;
    more = true;
    if (Math.abs(spin.x) <= 0.002 && Math.abs(spin.y) <= 0.002) { spin = { x: 0, y: 0 }; announce(); }
  } else if (auto) {
    autoT += dt;
    const pace = clamp((AUTO_MS - autoT) / 1000, 0, 1);   // full speed, then slower over the last second
    state = { rx: state.rx, ry: state.ry + (SPIN * pace * dt) / 1000 };
    if (autoT >= AUTO_MS) { announce(); endAuto(); } else more = true;
  }
  render();
  if (auto) announce();
  if (more && dialog.open) frame = requestAnimationFrame(step);
}

function loop() {
  if (!frame) { last = 0; frame = requestAnimationFrame(step); }
}

function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0; tween = null; auto = false; drag = null; spin = { x: 0, y: 0 };
}

function render() {
  const rx = Math.round(state.rx * 100) / 100, ry = Math.round(state.ry * 100) / 100;
  book.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  // The floor shadow is as wide as the book looks from above: cover width and thickness, seen at this angle.
  const a = (ry * Math.PI) / 180;
  const wide = Math.abs(Math.cos(a)) + 0.16 * Math.abs(Math.sin(a));
  floor.style.transform = `translateX(-50%) scaleX(${(0.3 + 0.7 * wide).toFixed(3)})`;
  // Only the side that faces the visitor can take a Tab stop. If the back-cover link has focus when the back turns
  // away, focus moves to the model, so it never rests on a link the visitor cannot see.
  const backShown = facing(ry) === 'Back cover';
  if (backLink) {
    backLink.tabIndex = backShown ? 0 : -1;
    if (!backShown && document.activeElement === backLink) stage.focus({ preventScroll: true });
  }
}

function announce() {
  const side = facing(state.ry);
  const el = dialog.querySelector('[data-p3d-side]');
  if (el.textContent !== side) el.textContent = side;
}

// ---------------------------------------------------------------- open and close
function fill(p) {
  title.textContent = `3D preview: ${p.name}`;
  stage.setAttribute('aria-label', `${p.name} program guide`);
  front.src = siteHref(`/covers/${encodeURIComponent(slugOf(p))}-brochure.svg`);
  front.alt = `Cover design of the ${p.name} program guide`;
  spineName.textContent = p.short;
  back.innerHTML = `
    <div class="p3d-back-in">
      <p class="p3d-back-brand">${WORDMARK}<span>Program guide</span></p>
      <p class="p3d-back-name">${esc(p.name)}</p>
      <dl class="p3d-facts">${facts(p).map(([k, v, extra]) => `<div${extra ? ` class="p3d-${extra}"` : ''}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="p3d-cred">${esc(CREDENTIAL_LINE)}</p>
      <a class="p3d-back-link" href="${esc(siteHref(p.url))}" aria-label="Program page: ${esc(p.name)}">Program page <span aria-hidden="true">→</span></a>
    </div>`;
  backLink = back.querySelector('a');
}

export async function openPreview({ programId, returnFocus } = {}) {
  const p = PROGRAMS.find((x) => x.id === programId);
  if (!p) return;
  await loadStyles();
  if (!dialog) build();
  if (dialog.open) return;
  returnTo = returnFocus ?? document.activeElement;
  stop();
  fill(p);
  state = { ...DEFAULT };
  render();
  announce();
  auto = !reducedMotion();
  autoT = 0;
  status.setAttribute('aria-live', auto ? 'off' : 'polite');
  dialog.showModal();
  document.documentElement.classList.add('p3d-lock');
  stage.focus({ preventScroll: true });
  if (auto) loop();
}

export function closePreview() {
  if (!dialog) return;
  stop();
  if (dialog.open) dialog.close();
  document.documentElement.classList.remove('p3d-lock');
  returnTo?.focus?.({ preventScroll: true });
  returnTo = null;
}

/** For tests and screenshots: the current turn, in degrees. */
export const view = () => ({ ...state });
