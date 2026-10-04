// The cinematic layer of the website, checked in the stylesheets themselves: every animation runs only for visitors
// who have not asked for reduced motion, every scroll-linked one only where the browser supports it, and nothing is
// hidden outside those guards (so content is fully visible without the feature, without JavaScript and with reduced
// motion). The browser side is tests/e2e/site-cinema.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const CSS_DIR = join(ROOT, 'web/assets/css');
const files = (await readdir(CSS_DIR)).filter((f) => f.endsWith('.css')).sort();
const sheets = await Promise.all(files.map(async (f) => ({ file: f, text: await readFile(join(CSS_DIR, f), 'utf8') })));

/**
 * Splits a stylesheet into its rules. Each rule has its selector (or at-rule prelude), its declarations and the
 * chain of at-rules it sits in, outermost first. Comments are removed; strings are kept whole so a brace inside a
 * url("…") cannot confuse the walk.
 */
export function rules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  const stack = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      buf += text.slice(i, end + 1);
      i = end;
    } else if (c === '{') {
      const head = buf.trim();
      buf = '';
      if (head.startsWith('@') && !/^@(font-face|property|page)\b/.test(head)) stack.push(head);
      else {
        // An ordinary rule (or a keyframe step): read its body up to the matching brace.
        const end = text.indexOf('}', i);
        out.push({ selector: head, body: text.slice(i + 1, end), at: [...stack] });
        i = end;
      }
    } else if (c === '}') {
      stack.pop();
      buf = '';
    } else buf += c;
  }
  return out;
}

const NO_MOTION_PREF = /^@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/;
const SUPPORTS_TIMELINE = /^@supports\s*\(\s*animation-timeline\s*:/;
const inMotionGuard = (r) => r.at.some((a) => NO_MOTION_PREF.test(a));
const inReduceBlock = (r) => r.at.some((a) => /prefers-reduced-motion\s*:\s*reduce/.test(a));
const inKeyframes = (r) => r.at.some((a) => a.startsWith('@keyframes'));
const decl = (body, prop) => [...body.matchAll(new RegExp(`(?:^|;)\\s*(${prop})\\s*:\\s*([^;]+)`, 'g'))].map((m) => [m[1], m[2].trim()]);
const where = (file, r) => `${file}: ${r.selector.replace(/\s+/g, ' ').slice(0, 90)}${r.at.length ? ` (in ${r.at.join(' > ')})` : ''}`;

test('every animation runs only inside @media (prefers-reduced-motion: no-preference)', () => {
  const loose = [];
  for (const { file, text } of sheets) {
    for (const r of rules(text)) {
      if (inKeyframes(r) || inReduceBlock(r)) continue;
      for (const [prop, value] of decl(r.body, 'animation(?:-name)?')) {
        if (/^none\b/.test(value)) continue;
        if (!inMotionGuard(r)) loose.push(`${where(file, r)} → ${prop}: ${value}`);
      }
    }
  }
  assert.deepEqual(loose, [], `animations outside the reduced-motion guard:\n${loose.join('\n')}`);
});

test('every scroll-linked animation also sits inside @supports (animation-timeline: …)', () => {
  const loose = [];
  let count = 0;
  for (const { file, text } of sheets) {
    for (const r of rules(text)) {
      for (const [prop, value] of decl(r.body, 'animation-(?:timeline|range)')) {
        count++;
        if (!inMotionGuard(r) || !r.at.some((a) => SUPPORTS_TIMELINE.test(a))) loose.push(`${where(file, r)} → ${prop}: ${value}`);
      }
    }
  }
  assert.ok(count >= 6, 'the scroll-linked cinema animations are missing');
  assert.deepEqual(loose, [], `scroll-linked animation outside the guards:\n${loose.join('\n')}`);
});

test('keyframes that start hidden are defined only inside the motion guard', () => {
  const loose = [];
  for (const { file, text } of sheets) {
    const all = rules(text);
    for (const r of all.filter(inKeyframes)) {
      const hides = /(?:^|;)\s*opacity\s*:\s*0(?:\.0*)?\s*(?:;|$)/.test(r.body) || /clip-path\s*:\s*inset\([^)]*100%/.test(r.body);
      if (hides && !r.at.some((a) => NO_MOTION_PREF.test(a))) loose.push(`${file}: ${r.at.at(-1)} ${r.selector}`);
    }
  }
  assert.deepEqual(loose, [], `keyframes that hide content outside the guard:\n${loose.join('\n')}`);
});

// Things that are hidden on purpose until an interaction or a script shows them, with the reason. Anything else
// that is hidden outside the motion guard fails, so a reveal can never leave content invisible without motion.
const HIDDEN_BY_DESIGN = new Map([
  ['site.css: .vstage img,.vstage video', 'the hero footage cross-fades: the current frame has .on (opacity 1)'],
  ['site.css: .advisor-pill .more', 'the pill widens on hover and focus to show the rest of its label'],
  ['site.css: .hs::after', 'the hotspot pulse ring, decoration only'],
  ['site.css: .sr-only', 'visually hidden text for screen readers'],
  ['site.css: .f-opt input', 'a native radio laid over its styled label, which shows the choice and the focus ring'],
]);

test('nothing is hidden outside the motion guard, except interface states listed with a reason', () => {
  const found = [];
  for (const { file, text } of sheets) {
    for (const r of rules(text)) {
      if (inKeyframes(r) || inMotionGuard(r)) continue;
      const hides = decl(r.body, 'opacity').some(([, v]) => /^0(?:\.0*)?(?:\s*!important)?$/.test(v))
        || decl(r.body, 'visibility').some(([, v]) => v.startsWith('hidden'))
        || decl(r.body, 'clip-path').some(([, v]) => /inset\([^)]*100%/.test(v));
      if (!hides) continue;
      const key = `${file}: ${r.selector.replace(/\s+/g, ' ')}`;
      if (!HIDDEN_BY_DESIGN.has(key) && !/:not\(\.on\)|\[hidden\]|\[aria-hidden/.test(r.selector)) found.push(key);
    }
  }
  assert.deepEqual(found, [], `hidden outside the motion guard (add a reason to HIDDEN_BY_DESIGN if intended):\n${found.join('\n')}`);
});

test('reduced motion stops everything, and the cinema layer is site-wide', async () => {
  const site = sheets.find((s) => s.file === 'site.css').text;
  const reduce = rules(site).filter(inReduceBlock).map((r) => r.body).join(';');
  assert.match(reduce, /animation\s*:\s*none\s*!important/);
  assert.match(reduce, /transition\s*:\s*none\s*!important/);
  // Reveals, heading wipes, Ken Burns, glows and hero parallax, each driven by the scroll position.
  for (const name of ['cine-rise', 'cine-wipe', 'cine-kb', 'cine-drift', 'cine-par']) assert.match(site, new RegExp(`@keyframes ${name}\\b`), name);
  // Scroll-driven motion animates only transform-like properties, opacity and clip-path (no layout, no big blurs).
  for (const r of rules(site).filter((x) => inKeyframes(x) && x.at.at(-1).includes('cine-'))) {
    for (const [prop] of decl(r.body, '[a-z-]+')) assert.ok(['opacity', 'translate', 'scale', 'transform', 'clip-path'].includes(prop), `${r.at.at(-1)} animates ${prop}`);
  }
  // Selectors are generic, so sections from any page get the treatment without new classes.
  assert.match(site, /main section:not\(\.hero,\.phero,\.pagehead\)/);
  // Chapter numbers come from a counter on the eyebrows, not from markup, and are skipped by screen readers.
  assert.match(site, /counter-reset:chapter/);
  assert.match(site, /content:counter\(chapter,decimal-leading-zero\) \/ ""/);
});

test('cinema.js only runs the spotlight for a precise pointer without reduced motion, and site.js loads it', async () => {
  const js = await readFile(join(ROOT, 'web/assets/js/cinema.js'), 'utf8');
  assert.match(js, /matchMedia\('\(pointer: fine\) and \(prefers-reduced-motion: no-preference\)'\)/);
  assert.match(js, /passive: true/);
  assert.doesNotMatch(js, /\.style\.(opacity|display|visibility)|hidden\s*=/, 'cinema.js must never hide content');
  const site = await readFile(join(ROOT, 'web/assets/js/site.js'), 'utf8');
  assert.match(site, /^import '\.\/cinema\.js';$/m);
});
