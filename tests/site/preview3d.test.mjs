// The 3D preview of a program guide, as built: every program card carries the "3D preview" button with an
// accessible name, nothing of the preview is linked from a page (it loads on first use), and its script and
// stylesheet are copied into the build without anything the Content-Security-Policy would block.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildForTest, decode } from './helpers.mjs';
import { PROGRAMS, CREDENTIAL } from '../../web/data/programs.mjs';

let site;
before(async () => { site = await buildForTest(); });
after(() => site?.cleanup());

const cardsIn = (html) => [...html.matchAll(/<article class="pcard ccard"[\s\S]*?<\/article>/g)].map((m) => m[0]);

test('every program card has a "3D preview" button with an accessible name, next to "Brochure"', () => {
  let cards = 0;
  for (const { path, html } of site.pages) {
    for (const card of cardsIn(html)) {
      cards++;
      const id = /data-program="([^"]+)"/.exec(card)[1];
      const p = PROGRAMS.find((x) => x.id === id);
      assert.ok(p, `${path}: card for a known program (${id})`);
      const buttons = [...card.matchAll(/<button\b[^>]*\bdata-preview3d-trigger\b[^>]*>([\s\S]*?)<\/button>/g)];
      assert.equal(buttons.length, 1, `${path} ${id}: exactly one 3D preview button`);
      const [tag, label] = [buttons[0][0], buttons[0][1]];
      assert.match(tag, /\btype="button"/, `${path} ${id}: a plain button`);
      const cls = (t) => /\bclass="([^"]*)"/.exec(t)?.[1];
      assert.match(cls(tag), /^btn ghost\b/, `${path} ${id}: a ghost button`);
      assert.equal(cls(tag), cls(/<button\b[^>]*\bdata-brochure-trigger\b[^>]*>/.exec(card)[0]), `${path} ${id}: the same style as "Brochure"`);
      assert.match(tag, /\baria-haspopup="dialog"/, `${path} ${id}: announces that it opens a dialog`);
      assert.match(tag, new RegExp(`data-program-id="${id}"`), `${path} ${id}: names its program`);
      const name = decode(/aria-label="([^"]*)"/.exec(tag)?.[1] ?? '');
      assert.equal(name, `3D preview of the ${p.name} program guide`, `${path} ${id}: accessible name`);
      assert.equal(label.trim(), '3D preview', `${path} ${id}: visible label`);
      assert.ok(name.startsWith(label.trim()), `${path} ${id}: the accessible name starts with the visible label`);
      // It sits beside the brochure button, in the layer above the card's stretched link.
      assert.match(card, /<p class="ccard-brochure"[^>]*>\s*<button[^>]*data-brochure-trigger[^>]*>[^<]*<\/button>\s*<button[^>]*data-preview3d-trigger/, `${path} ${id}: next to "Brochure"`);
    }
  }
  assert.ok(cards >= PROGRAMS.length, `cards were found (${cards})`);
});

test('nothing of the preview is linked from a page: it loads only when a visitor asks for it', () => {
  for (const { path, html } of site.pages) {
    assert.doesNotMatch(html, /preview3d\.(js|css)/, `${path}: no script or stylesheet link to the preview`);
    assert.doesNotMatch(html, /class="p3d[\s"-]/, `${path}: no preview markup in the page`);
  }
});

test('preview3d.js and preview3d.css are built and need nothing the CSP blocks', async () => {
  const js = await readFile(join(site.outDir, 'js/preview3d.js'), 'utf8');
  const css = await readFile(join(site.outDir, 'css/preview3d.css'), 'utf8');
  assert.doesNotMatch(js, /<script/i, 'no inline <script> in the markup it writes');
  assert.doesNotMatch(js, /\son[a-z]+\s*=\s*["']/i, 'no inline event-handler attributes');
  assert.doesNotMatch(js, /javascript:/i, 'no javascript: URLs');
  assert.doesNotMatch(js, /\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*["'`]/, 'no code from strings');
  assert.doesNotMatch(js, /<style/i, 'no <style> blocks; styles live in preview3d.css');
  assert.match(js, /import \{ CATALOG \} from '\.\/catalog\.mjs'/, 'program facts come from the generated catalog');
  assert.match(js, /\/css\/preview3d\.css/, 'loads its own stylesheet on first use');
  // The credential line is the site's wording, word for word.
  assert.ok(js.includes(`'${CREDENTIAL.short} · not an accredited degree'`), 'credential line');
  // No printed or PDF guide exists yet: the wording says it shows the guide's design, with facts from the program page.
  assert.ok(js.includes("'A 3D model of the program guide’s design, with facts from the program page. Drag or use the arrow keys to turn it.'"), 'the honest one-line description');
  assert.ok(js.includes('`Cover design of the ${p.name} program guide`'), 'the cover is described as a design');
  assert.doesNotMatch(js, /Front cover of the/, 'no wording that suggests a finished printed guide');
  // The automatic turn has a time limit (WCAG 2.2.2): it stops by itself after a few seconds.
  const auto = /const AUTO_MS = (\d+);/.exec(js);
  assert.ok(auto && Number(auto[1]) <= 5000, `the automatic turn lasts at most 5 seconds (${auto?.[1]})`);
  assert.doesNotMatch(js, /\bAR\b|augmented reality|camera|getUserMedia/i, 'no camera or AR claims');
  // Only transforms move: no CSS animation or transition other than on transform (and colour on hover).
  for (const m of css.matchAll(/transition:([^;}]+)/g)) {
    for (const part of m[1].split(',')) assert.match(part.trim(), /^(transform|background-color|border-color|color|opacity)\b/, `transition on ${part.trim()}`);
  }
  assert.doesNotMatch(css, /@keyframes|animation:/, 'no CSS animations');
  // Forced colours keep the book's own colours (it is an illustration), so its spine and edges do not vanish.
  assert.match(css, /@media \(forced-colors:active\)\{[^}]*\.p3d-book\{forced-color-adjust:none\}/, 'forced colours');
  // Reduced motion: the automatic turn and the inertia are skipped in the script.
  assert.match(js, /prefers-reduced-motion: reduce/, 'reads prefers-reduced-motion');
});

test('the site script wires the button and loads the preview on first use only', async () => {
  const js = await readFile(join(site.outDir, 'js/site.js'), 'utf8');
  assert.match(js, /\$\$\('\[data-preview3d-trigger\]'\)/, 'finds every 3D preview button');
  assert.match(js, /import\('\.\/preview3d\.js'\)/, 'loads preview3d.js with a dynamic import');
  assert.doesNotMatch(js, /^import[^;]*preview3d/m, 'never imports it up front');
});
