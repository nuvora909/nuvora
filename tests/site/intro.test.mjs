// The white logo intro, checked in the built pages and the source files: a tiny gate script in <head> before the
// stylesheets, a decorative aria-hidden overlay right after <body> that nothing can focus, CSS motion that only runs
// without reduced motion and ends hidden on its own, and the "nuvora:intro-done" event other scripts can wait for.
// The browser side is tests/e2e/site-intro.spec.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, buildForTest } from './helpers.mjs';
import { artifactHtml } from '../../scripts/build-site.mjs';

const read = (p) => readFile(join(ROOT, p), 'utf8');
let site;
before(async () => { site = await buildForTest(); });
after(() => site?.cleanup());

test('the gate is a tiny classic script in <head>, before every stylesheet, that never breaks without storage', async () => {
  const gate = await read('web/assets/js/intro-gate.js');
  assert.ok(Buffer.byteLength(gate) < 1024, `intro-gate.js is ${Buffer.byteLength(gate)} bytes (under 1 KB)`);
  assert.doesNotMatch(gate, /^\s*(import|export)\b/m, 'a classic script, not a module');
  assert.match(gate, /try\s*\{[^}]*sessionStorage\.getItem/, 'reading sessionStorage is wrapped in try/catch');
  assert.match(gate, /try\s*\{[^}]*sessionStorage\.setItem/, 'writing sessionStorage is wrapped in try/catch');
  assert.match(gate, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(gate, /classList\.add\('intro-off'\)/);
  // Run it: a first visit records the intro; a later page, or reduced motion, hides it; no storage means it plays.
  const run = ({ stored = null, reduce = false, storage = true } = {}) => {
    const classes = new Set(), saved = {};
    const sessionStorage = storage ? { getItem: (k) => (k in saved ? saved[k] : stored), setItem: (k, v) => { saved[k] = v; } }
      : { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const document = { documentElement: { classList: { add: (c) => classes.add(c) } } };
    new Function('document', 'sessionStorage', 'matchMedia', gate)(document, sessionStorage, () => ({ matches: reduce }));
    return { off: classes.has('intro-off'), saved };
  };
  assert.deepEqual(run(), { off: false, saved: { 'nuvora.intro': '1' } });
  assert.deepEqual(run({ stored: '1' }), { off: true, saved: {} });
  assert.deepEqual(run({ reduce: true }), { off: true, saved: {} });
  assert.deepEqual(run({ storage: false }), { off: false, saved: {} });

  for (const { path, html } of site.pages) {
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
    const tag = /<script\b[^>]*src="\/js\/intro-gate\.js"[^>]*><\/script>/.exec(head)?.[0];
    assert.ok(tag, `${path}: intro-gate.js in <head>`);
    assert.doesNotMatch(tag, /\s(type|defer|async)\b/, `${path}: the gate runs at once (no module, defer or async)`);
    assert.ok(head.indexOf(tag) < head.indexOf('rel="stylesheet"'), `${path}: the gate comes before the stylesheets`);
    assert.ok(head.includes('<link rel="stylesheet" href="/css/intro.css">'), `${path}: intro.css`);
    assert.ok(head.includes('<script type="module" src="/js/intro.js"></script>'), `${path}: intro.js`);
  }
});

test('every page has the overlay right after <body>: decorative, aria-hidden, nothing focusable, no inline script', () => {
  for (const { path, html } of site.pages) {
    const m = /<body[^>]*>\s*(<div class="intro"[^>]*>)([\s\S]*?)<a class="skip"/.exec(html);
    assert.ok(m, `${path}: the overlay is the first thing in <body>, before the skip link`);
    const [, open, inner] = m;
    assert.match(open, /\saria-hidden="true"/, `${path}: aria-hidden`);
    assert.match(open, /\sdata-intro\b/, `${path}: data-intro hook`);
    assert.match(open, /\sstyle="display:none"/, `${path}: hidden unless intro.css shows it`);
    assert.doesNotMatch(inner, /<(a|button|input|select|textarea|script|iframe)\b|\stabindex=|\shref=/i, `${path}: nothing focusable or scripted inside`);
    assert.match(inner, /<svg [^>]*focusable="false"/, `${path}: the ring is not focusable`);
    assert.equal((html.match(/\sdata-intro\b/g) || []).length, 1, `${path}: one overlay`);
  }
});

// Splits a stylesheet into rules with the at-rules each sits in (comments removed).
function rules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [], stack = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      const head = buf.trim(); buf = '';
      if (head.startsWith('@') && !/^@font-face/.test(head)) stack.push(head);
      else { const end = text.indexOf('}', i); out.push({ selector: head, body: text.slice(i + 1, end), at: [...stack] }); i = end; }
    } else if (c === '}') { stack.pop(); buf = ''; } else buf += c;
  }
  return out;
}

test('intro.css: shown and animated only without reduced motion, about 3.2 s, and it ends hidden on its own', async () => {
  const all = rules(await read('web/assets/css/intro.css'));
  const guard = (r) => r.at.some((a) => /^@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(a));
  const loose = all.filter((r) => !guard(r) && !(r.at[0] === '@media print' && /display:none!important/.test(r.body)));
  assert.deepEqual(loose.map((r) => r.selector), [], 'every rule (but the print one) sits inside the motion guard');
  const rule = (sel) => all.find((r) => r.selector === sel && !r.at.some((a) => a.startsWith('@keyframes')));
  assert.match(rule('.intro').body, /display:grid!important/);
  assert.match(rule('.intro').body, /position:fixed/);
  assert.match(rule('.intro').body, /background:#FFFFFF/i, 'white in light and dark mode');
  assert.match(rule('html.intro-off .intro').body, /display:none!important/, 'a later page of the visit never shows it');
  // The overlay's own exit decides when it is gone: delay + duration of intro-out is about 3.2 s.
  const [, dur, delay] = /animation:intro-out ([\d.]+)s \S+ ([\d.]+)s both/.exec(rule('.intro').body);
  const total = Number(dur) + Number(delay);
  assert.ok(total >= 2.8 && total <= 3.6, `the intro lasts ${total} s`);
  // The title is readable by about 1.3 s, and every timed part of the sequence exists.
  const keyframes = (name) => all.filter((r) => r.at.at(-1) === `@keyframes ${name}`).map((r) => r.body).join(';');
  for (const name of ['intro-out']) {
    assert.match(keyframes(name), /visibility:hidden/, `${name} ends with visibility hidden`);
    assert.match(keyframes(name), /pointer-events:none/, `${name} ends with pointer-events none`);
  }
  assert.doesNotMatch(await read('web/assets/css/intro.css'), /intro-skip|is-skipped/, 'skipping does not wait for a CSS fade');
  for (const name of ['intro-focus', 'intro-draw', 'intro-pop', 'intro-bloom', 'intro-bar-top', 'intro-bar-bottom', 'intro-gather', 'intro-flare', 'intro-tag', 'intro-push', 'intro-exit']) assert.ok(keyframes(name), `@keyframes ${name}`);
  const rise = /animation:intro-focus ([\d.]+)s \S+ calc\(var\(--i\) \* (\d+)ms \+ (\d+)ms\)/.exec(rule('.intro-l,.intro-o').body);
  const letters = 6;
  const lastIn = Number(rise[3]) + (letters - 1) * Number(rise[2]) + Number(rise[1]) * 1000 * 0.6;   // ease-out: ~95% there at 60% of the time
  assert.ok(lastIn <= 1300, `the last letter is readable at ${lastIn} ms`);
  // Motion uses transforms, opacity, filters and strokes only (no layout properties).
  for (const r of all.filter((x) => x.at.at(-1)?.startsWith('@keyframes'))) {
    for (const [, prop] of r.body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)) {
      assert.ok(['opacity', 'translate', 'scale', 'filter', 'stroke-dashoffset', 'visibility', 'pointer-events'].includes(prop), `${r.at.at(-1)} animates ${prop}`);
    }
  }
});

test('intro.js skips on input, removes the overlay, never traps focus, and announces the end once', async () => {
  const js = await read('web/assets/js/intro.js');
  assert.match(js, /new CustomEvent\('nuvora:intro-done', \{ detail: \{ shown, skipped \} \}\)/);
  assert.match(js, /document\.dispatchEvent\(/);
  assert.match(js, /setAttribute\('data-intro-done', ''\)/, 'a flag for scripts that start after the event');
  assert.match(js, /el\?\.remove\(\)/);
  assert.match(js, /'pointerdown', 'keydown'/);
  assert.match(js, /passive: type !== 'pointerdown'/, 'pointer input can be stopped before the page underneath');
  assert.match(js, /function skip\(event\)[\s\S]*?end\(true\);/, 'the input event completes the skip immediately');
  assert.match(js, /event\.stopImmediatePropagation\(\)/, 'the input does not reach the page underneath');
  assert.match(js, /addEventListener\('click', swallowClick, \{ capture: true, once: true \}\)/, 'the same pointer press cannot activate the page');
  assert.match(js, /function swallowClick\(event\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(js, /\.focus\(|inert/, 'focus is never moved or trapped');
  assert.match(js, /getComputedStyle\(el\)\.display === 'none'/, 'when it is not shown, it ends at once');
});

test('the artifact preview build keeps the intro working with relative paths', () => {
  const home = site.pages.find((p) => p.path === '/').html;
  const nested = site.pages.find((p) => p.path === '/tuition/').html;
  assert.match(artifactHtml(home, '/'), /<script src="\.\/js\/intro-gate\.js"><\/script>/);
  const a = artifactHtml(nested, '/tuition/');
  assert.match(a, /<script src="\.\.\/js\/intro-gate\.js"><\/script>/);
  assert.match(a, /<link rel="stylesheet" href="\.\.\/css\/intro\.css">/);
  assert.match(a, /<script type="module" src="\.\.\/js\/intro\.js"><\/script>/);
});
