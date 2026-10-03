// Shared steps for the website tests: build the site into a temporary folder and read pages as text.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSite } from '../../scripts/build-site.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const fileFor = (outDir, path) => (path === '/404' ? join(outDir, '404.html') : join(outDir, ...path.split('/').filter(Boolean), 'index.html'));

/**
 * Builds the website into a fresh temporary folder (never dist/). Strict by default: a page module that throws
 * fails the build, as it would in production. Returns every built page with its HTML.
 */
export async function buildForTest({ strict = true } = {}) {
  if (strict) delete process.env.NUVORA_BUILD_LENIENT;
  else process.env.NUVORA_BUILD_LENIENT = '1';
  const outDir = await mkdtemp(join(tmpdir(), 'nuvora-site-test-'));
  const { pages: paths } = await buildSite({ outDir, quiet: true, media: false });
  const pages = await Promise.all(paths.map(async (path) => ({ path, html: await readFile(fileFor(outDir, path), 'utf8') })));
  return {
    outDir, paths, pages,
    /** The browser copy of the catalog that the build generates (web/assets/js modules import it). */
    catalog: async () => (await import(pathToFileURL(join(outDir, 'js/catalog.mjs')).href)).CATALOG,
    cleanup: () => rm(outDir, { recursive: true, force: true }),
  };
}

/** Page modules the build knows about (scripts/build-site.mjs PAGES) that have no file in web/pages yet. */
export async function missingPageModules() {
  const src = await readFile(resolve(ROOT, 'scripts/build-site.mjs'), 'utf8');
  const names = [...src.match(/const PAGES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const missing = [];
  for (const n of names) {
    try { await readFile(resolve(ROOT, 'web/pages', `${n}.mjs`)); } catch { missing.push(n); }
  }
  return missing;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+|#39);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const INLINE = 'a|abbr|b|bdi|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|label';

/**
 * The text a visitor can perceive: the title, the meta description, body text (scripts, styles and SVG drawings
 * removed) and alt / aria-label / title / placeholder attributes. Inline tags join their text; block tags break it.
 */
export function visibleText(html) {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? '';
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '\n');
  const attrs = [...body.matchAll(/\s(?:alt|aria-label|title|placeholder)="([^"]*)"/gi)].map((m) => m[1]);
  const text = body
    .replace(new RegExp(`</?(?:${INLINE})\\b[^>]*>`, 'gi'), '')
    .replace(/<[^>]+>/g, '\n');
  return decode([title, description, text, ...attrs].join('\n')).replace(/[ \t\r\f\v]+/g, ' ').replace(/\n\s*/g, '\n');
}

/** Phrases the site must never use: invented outcomes, popularity claims and formats Nuvora does not offer. */
export const BANNED = /median|fastest 25%|most (popular|chosen)|trending|thousands of|testimonial|tested out|credit earned|no required live classes|no weekly deadlines|self-paced|24\/7|7 days a week|employer connections|job guarantee|guaranteed (job|placement)/i;

/**
 * Every mention of accreditation must deny it ("not an accredited degree", "is not accredited") or ask about
 * it ("Is Nuvora an accredited university?"). Returns the mentions that do neither.
 */
export function unnegatedAccredited(text) {
  const bad = [];
  for (const m of text.matchAll(/accredit\w*/gi)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const sentence = /^[^.!?\n]*[.!?]?/.exec(text.slice(m.index))[0].trim();
    const negated = /\b(not|no|never|isn[’']t|aren[’']t|without|neither|nor)\b(\s+[\w’'-]+){0,2}\s*$/i.test(before);
    const question = sentence.endsWith('?');
    if (!negated && !question) bad.push(`…${before}${sentence}`.replace(/\s+/g, ' ').slice(-120));
  }
  return bad;
}

/**
 * "Guarantee" may only appear as a denial ("does not guarantee jobs", "we don’t guarantee").
 */
export function unnegatedGuarantee(text) {
  const bad = [];
  for (const m of text.matchAll(/guarantee\w*/gi)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!/\b(not|no|never|don[’']t|doesn[’']t|won[’']t|cannot|can[’']t|without)\b(\s+[\w’'-]+){0,2}\s*$/i.test(before)) {
      bad.push(`…${before}${text.slice(m.index, m.index + 40)}`.replace(/\s+/g, ' '));
    }
  }
  return bad;
}
