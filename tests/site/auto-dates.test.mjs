// Dates on the static website never need a manual step: every schedule date on every page is one the browser
// refreshes (site.js refreshDates), a build "as of" any day is right on every page, and production is rebuilt
// daily by .github/workflows/daily-site.yml (deploy hook optional until go-live).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSite } from '../../scripts/build-site.mjs';
import { ROOT, fileFor } from './helpers.mjs';
import { nextStarts, termDates, fromIso, isoDay } from '../../web/assets/js/dates.mjs';

const builds = {};
const DAYS = ['2026-10-11', '2026-11-15', '2026-12-28', '2026-12-29'];

before(async () => {
  delete process.env.NUVORA_BUILD_LENIENT;
  for (const day of DAYS) {
    const outDir = await mkdtemp(join(tmpdir(), 'nuvora-dates-'));
    const { pages } = await buildSite({ outDir, quiet: true, media: false, today: fromIso(day) });
    builds[day] = { outDir, pages: await Promise.all(pages.map(async (path) => ({ path, html: await readFile(fileFor(outDir, path), 'utf8') }))) };
  }
});
after(() => Promise.all(Object.values(builds).map((b) => rm(b.outDir, { recursive: true, force: true }))));

const liveDates = (html) => [...html.matchAll(/<time datetime="([\d-]+)" data-date="(\w+)" data-n="(\d+)">/g)].map((m) => ({ iso: m[1], kind: m[2], n: Number(m[3]) }));

test('a build as of any day shows that day\'s starts on every page, including the closing day and the day after', async () => {
  for (const day of DAYS) {
    const starts = nextStarts(8, fromIso(day));
    const want = (kind, n) => isoDay(kind === 'applyBy' ? starts[n].applyBy : kind === 'end' ? termDates(starts[n].start, 1)[0].end : starts[n].start);
    let seen = 0;
    for (const p of builds[day].pages) {
      for (const d of liveDates(p.html)) { assert.equal(d.iso, want(d.kind, d.n), `${day} ${p.path} ${d.kind} ${d.n}`); seen++; }
      assert.match(p.html, new RegExp(`<span data-year>${day.slice(0, 4)}</span>`), `${day} ${p.path} footer year`);
    }
    assert.ok(seen > 100, `${day}: live dates on every page`);
  }
  const first = (day) => liveDates(builds[day].pages.find((p) => p.path === '/').html).find((d) => d.kind === 'start' && d.n === 0).iso;
  assert.equal(first('2026-12-28'), '2027-01-04', 'the closing day is still open');
  assert.equal(first('2026-12-29'), '2027-02-01', 'the day after, the next start');
  // Search engines read the built course dates (no JavaScript): the daily rebuild keeps them current.
  const program = builds['2026-12-29'].pages.find((p) => p.path.startsWith('/programs/bs-'));
  assert.match(program.html, /"startDate":\s*"2027-02-01"/);
});

test('every schedule date on every page is one the browser refreshes', async () => {
  // Two builds a month apart differ only inside the parts that site.js and lead.js rewrite from today's date.
  const strip = (html) => html
    .replace(/<time datetime="[\d-]+" data-date="\w+" data-n="\d+">[^<]*<\/time>/g, '<time data-date>')
    .replace(/<table[^>]*data-termpath[\s\S]*?<\/table>/g, '<table data-termpath>')
    .replace(/<select[^>]*name="start"[\s\S]*?<\/select>/g, '<select name="start">')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace(/wmg\d+/g, 'wmg'); // the logo's gradient ids count up across builds in one process
  const [a, b] = [builds['2026-10-11'], builds['2026-11-15']];
  assert.deepEqual(a.pages.map((p) => p.path), b.pages.map((p) => p.path));
  for (const [i, p] of a.pages.entries()) {
    const x = strip(p.html), y = strip(b.pages[i].html);
    if (x === y) continue;
    let at = 0;
    while (x[at] === y[at]) at++;
    assert.fail(`${p.path}: a date that the browser never refreshes: …${x.slice(Math.max(0, at - 160), at + 80)}…`);
  }
  // And site.js refreshes each kind of live date the pages use.
  const site = await readFile(resolve(ROOT, 'web/assets/js/site.js'), 'utf8');
  const kinds = new Set(a.pages.flatMap((p) => liveDates(p.html).map((d) => d.kind)));
  assert.deepEqual([...kinds].sort(), ['applyBy', 'end', 'start']);
  for (const k of ['applyBy', 'end']) assert.ok(site.includes(`el.dataset.date === '${k}'`), `site.js handles ${k}`);
  for (const s of ['time[data-date]', 'table[data-termpath]', '[data-year]', "'pageshow'", "'visibilitychange'", 'nuvora:dates']) {
    assert.ok(site.includes(s), `site.js: ${s}`);
  }
});

test('the daily rebuild workflow: after New York midnight, by hand too, tested, and the deploy hook only if set', async () => {
  const yml = await readFile(resolve(ROOT, '.github/workflows/daily-site.yml'), 'utf8');
  const on = yml.slice(yml.indexOf('\non:'), yml.indexOf('\npermissions:'));
  const crons = [...on.matchAll(/- cron: '(\d+) (\d+) \* \* \*'/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(crons.length >= 1, 'a daily schedule');
  for (const [, hour] of crons) assert.ok(hour >= 5, `${hour}:xx UTC is after midnight in New York in winter (UTC-5) and summer (UTC-4)`);
  assert.match(on, /\n {2}workflow_dispatch:/);
  assert.match(yml, /run: node scripts\/build-site\.mjs --out "\$RUNNER_TEMP\/site" --no-media/);
  assert.match(yml, /run: node --test "tests\/site\/\*\.test\.mjs"/);
  assert.match(yml, /\n {6}DEPLOY_HOOK: \$\{\{ secrets\.CLOUDFLARE_PAGES_DEPLOY_HOOK \}\}/);
  const steps = yml.split(/\n {6}- /).slice(1);
  const deploy = steps.find((s) => s.includes('curl'));
  assert.match(deploy, /if: \$\{\{ env\.DEPLOY_HOOK != '' \}\}/, 'the deploy step runs only when the secret is set');
  assert.match(deploy, /-X POST "\$DEPLOY_HOOK"/);
  assert.ok(steps.findIndex((s) => s.includes('curl')) > steps.findIndex((s) => s.includes('tests/site')), 'deploys only after the tests pass');
  assert.match(steps.find((s) => s.includes("env.DEPLOY_HOOK == ''")), /run: echo "::notice::/, 'without the secret: a notice, and success');
  assert.doesNotMatch(yml, /deploy_hooks\/|api\.cloudflare\.com/, 'no hook URL in the repository');
  assert.doesNotMatch(yml, /echo[^\n]*\$DEPLOY_HOOK/, 'the hook is never printed');
});
