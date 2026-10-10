// Safety net for broken modules. On 8 and 9 October another tool damaged files so that a browser module imported a
// name its target no longer exported, which only shows up as a blank feature in the browser. Every import in the
// portal and website modules must point at a file that exists and exports each name asked for, and every one of
// those files must parse (node --check). That covers relative imports, the site-absolute ones the portal uses
// (/js/... is web/assets/js/, /portal/... is portal/), and lazy import() calls, including the names read from the
// module they load: (await import(x)).NAME, const { a } = await import(x), import(x).then((m) => m.NAME) and
// mod ??= await import(x); mod.NAME.
//
// js/catalog.mjs is skipped: the build writes it (scripts/build-site.mjs), so it is not in the source tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT } from './helpers.mjs';

const run = promisify(execFile);
const DIRS = ['portal/js', 'web/assets/js', 'web/lib', 'web/pages', 'web/data'];
const GENERATED = new Set([resolve(ROOT, 'web/assets/js/catalog.mjs')]);
/** Where an import points: relative to the importing file, or a site-absolute path mapped to the source tree. */
export function resolveSpec(file, spec) {
  if (spec.startsWith('/js/')) return resolve(ROOT, 'web/assets/js', spec.slice('/js/'.length));
  if (spec.startsWith('/portal/')) return resolve(ROOT, 'portal', spec.slice('/portal/'.length));
  return resolve(dirname(file), spec);
}
const CHECKED = (spec) => /^(\.\.?\/|\/js\/|\/portal\/)/.test(spec);
const rel = (f) => relative(ROOT, f).split(sep).join('/');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (/\.(m?js)$/.test(e.name)) out.push(f);
  }
  return out;
}

/** Names inside { a, b as c, default as d }: the names the other module must export (a, b, default). */
const braceNames = (inner) => inner.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/)[0].trim());

/** { a, b: c, d = 1 } in a destructuring pattern: the property names a, b, d. */
const destructured = (inner) => inner.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/[:=]/)[0].trim()).filter((n) => /^[\w$]+$/.test(n));
/** The properties read from variable v in text: v.NAME (not w.v.NAME). */
const usesOf = (v, text) => [...new Set([...text.matchAll(new RegExp(`(?<![\\w$.])${v.replace(/\$/g, '\\$')}\\.([\\w$]+)`, 'g'))].map((m) => m[1]))];
/** Text up to the end of the enclosing top-level function (the next line that starts with a closing brace). */
const toScopeEnd = (text) => { const i = text.search(/\n\}/); return i < 0 ? text : text.slice(0, i); };
/** An arrow function's body at the start of text: a balanced { block } or the rest of the line. */
function arrowBody(text) {
  const t = text.trimStart();
  if (!t.startsWith('{')) return t.split('\n')[0];
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}' && --depth === 0) return t.slice(0, i + 1);
  }
  return t;
}

/** The names read from the module that an import() call loads; src[start, end) is the call itself. */
function dynamicNames(src, start, end) {
  const before = src.slice(Math.max(0, start - 300), start), after = src.slice(end);
  let m;
  // (await import('x')).NAME
  if (/\(\s*await\s+$/.test(before) && (m = /^\s*\)\s*\.\s*([\w$]+)/.exec(after))) return [m[1]];
  // const { a, b } = await import('x')
  if ((m = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+$/.exec(before))) return destructured(m[1]);
  // import('x').then(({ a }) => ...)  or  import('x').then((m) => ... m.NAME ...)
  if ((m = /^\s*\.then\(\s*(?:\(\s*\{([^}]*)\}\s*\)|\(\s*([\w$]+)\s*\)|([\w$]+))\s*=>/.exec(after))) {
    return m[1] != null ? destructured(m[1]) : usesOf(m[2] ?? m[3], arrowBody(after.slice(m[0].length)));
  }
  // mod ??= await import('x'); ... mod.NAME   (or mod = await import('x'))
  if ((m = /([\w$]+)\s*(?:\?\?=|=)\s*await\s+$/.exec(before))) return usesOf(m[1], toScopeEnd(after));
  return [];
}

/** The imports of a module's source that point into the source tree: [{ spec, names, line }]. names: what must be
 *  exported ('default' too). */
export function importsOf(src) {
  const out = [];
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  // import X from, import { a } from, import X, { a } from, import * as ns from, import X, * as ns from
  for (const m of src.matchAll(/^[ \t]*import\s+([\w$]+\s*,\s*)?(\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+)\s+from\s+(['"])([^'"]+)\3/gm)) {
    const names = [];
    if (m[1]) names.push('default');
    if (m[2].startsWith('{')) names.push(...braceNames(m[2].slice(1, -1)));
    else if (!m[2].startsWith('*')) names.push('default');
    out.push({ spec: m[4], names, line: lineOf(m.index) });
  }
  // import './side-effect.js'
  for (const m of src.matchAll(/^[ \t]*import\s+(['"])([^'"]+)\1/gm)) out.push({ spec: m[2], names: [], line: lineOf(m.index) });
  // export { a } from, export * from, export * as ns from
  for (const m of src.matchAll(/^[ \t]*export\s+(\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?)\s+from\s+(['"])([^'"]+)\2/gm)) {
    out.push({ spec: m[3], names: m[1].startsWith('{') ? braceNames(m[1].slice(1, -1)) : [], line: lineOf(m.index) });
  }
  // import('./lazy.js'): the file must exist and export the names read from it
  for (const m of src.matchAll(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    out.push({ spec: m[2], names: dynamicNames(src, m.index, m.index + m[0].length), line: lineOf(m.index) });
  }
  return out.filter((i) => CHECKED(i.spec));
}

/** The names a module exports, following export * from other files. */
const exportCache = new Map();
export function exportsOf(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^[ \t]*export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^[ \t]*export\s+class\s+([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^[ \t]*export\s+(?:const|let|var)\s+([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^[ \t]*export\s+(?:const|let|var)\s+[{[]([^}\]=]*)[}\]]\s*=/gm)) {
    for (const part of m[1].split(',')) { const n = part.split(':').pop().trim(); if (/^[\w$]+$/.test(n)) names.add(n); }
  }
  if (/^[ \t]*export\s+default\b/m.test(src)) names.add('default');
  for (const m of src.matchAll(/^[ \t]*export\s+\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',').map((s) => s.trim()).filter(Boolean)) names.add(part.split(/\s+as\s+/).pop().trim());
  }
  for (const m of src.matchAll(/^[ \t]*export\s+\*\s+as\s+([\w$]+)\s+from/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^[ \t]*export\s+\*\s+from\s+(['"])([^'"]+)\1/gm)) {
    const target = resolve(dirname(file), m[2]);
    if (existsSync(target)) for (const n of exportsOf(target, seen)) if (n !== 'default') names.add(n);
  }
  exportCache.set(file, names);
  return names;
}

const FILES = DIRS.flatMap((d) => walk(resolve(ROOT, d)));

test('the import and export readers understand the forms this code uses', () => {
  const found = importsOf([
    "import { a, b as c } from './x.js';",
    "import D, { e } from '../y.mjs';",
    "import * as ns from './z.js';",
    "import './side.js';",
    "export { f, g as h } from './w.js';",
    "import { remote } from '/js/abs.mjs';",
    "import { far } from 'https://cdn.example/far.js';",
    "function a() {",
    "  const m = await import('./lazy.js');",
    "  try { return (await import('/js/rule.mjs')).RULE; } catch { return null; }",
    "  const { p, q: r } = await import('/portal/js/kit.js');",
    "  import('./then.js').then((mm) => mm.A.b + mm.B);",
    "  import('./then2.js').then(({ C, D }) => { C(); D(); });",
    "  let mod;",
    "  const open = async () => { mod ??= await import('./late.js'); mod.openIt(); other.mod.no(); };",
    "  m.used();",
    "}",
    "function b() { mod.elsewhere(); }",
  ].join('\n'));
  assert.deepEqual(found.map((i) => [i.spec, i.names]), [
    ['./x.js', ['a', 'b']], ['../y.mjs', ['default', 'e']], ['./z.js', []], ['/js/abs.mjs', ['remote']], ['./side.js', []], ['./w.js', ['f', 'g']],
    ['./lazy.js', ['used']], ['/js/rule.mjs', ['RULE']], ['/portal/js/kit.js', ['p', 'q']], ['./then.js', ['A', 'B']], ['./then2.js', ['C', 'D']],
    ['./late.js', ['openIt']],
  ]);
  assert.equal(resolveSpec(resolve(ROOT, 'portal/js/pages/admin.js'), '/js/access-rule.mjs'), resolve(ROOT, 'web/assets/js/access-rule.mjs'));
  assert.equal(resolveSpec(resolve(ROOT, 'web/assets/js/site.js'), './preview3d.js'), resolve(ROOT, 'web/assets/js/preview3d.js'));
});

test('every import resolves to an existing file that exports each imported name, lazy imports too', () => {
  assert.ok(FILES.length > 40, `found the modules (${FILES.length})`);
  const bad = [];
  for (const file of FILES) {
    for (const { spec, names, line } of importsOf(readFileSync(file, 'utf8'))) {
      const target = resolveSpec(file, spec);
      if (GENERATED.has(target)) continue;
      const where = `${rel(file)}:${line} imports '${spec}'`;
      if (!existsSync(target) || !statSync(target).isFile()) { bad.push(`${where}, which does not exist`); continue; }
      const exported = exportsOf(target);
      for (const n of names) if (!exported.has(n)) bad.push(`${where}, which does not export ${n === 'default' ? 'a default' : `"${n}"`}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every portal and website module parses (node --check)', async () => {
  const bad = [];
  const queue = [...FILES];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try { await run(process.execPath, ['--check', f], { cwd: ROOT }); } catch (e) { bad.push(`${rel(f)}: ${String(e.stderr || e.message).replace(/\r/g, '').trim().split('\n').slice(0, 5).join(' | ')}`); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  assert.deepEqual(bad, []);
});
