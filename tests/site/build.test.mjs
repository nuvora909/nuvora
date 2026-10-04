// The built website: every page is a complete, honest, correctly linked document. The checks loop over every
// page the build returns, so pages added later are covered without editing this file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildForTest, missingPageModules, visibleText, decode, BANNED, unnegatedAccredited, ROOT } from './helpers.mjs';
import { SITE, OWNER, SCHEDULE } from '../../web/data/site.mjs';
import { PROGRAMS, TUITION, money, todayInKolkata } from '../../web/data/programs.mjs';
import { fromIso } from '../../web/assets/js/dates.mjs';
import { ACCESS_RULE } from '../../web/assets/js/access-rule.mjs';

const DAY = 86400000;
let site;
before(async () => { site = await buildForTest(); });
after(() => site?.cleanup());

const is404 = (p) => p.path === '/404';
const count = (s, re) => [...s.matchAll(re)].length;
const attr = (tag, name) => decode(new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? '');
const titleOf = (html) => decode(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
const descriptionOf = (html) => decode(/<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? '');
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const isFile = async (f) => Boolean((await stat(f).catch(() => null))?.isFile());

function walk(value, visit) {
  if (Array.isArray(value)) { value.forEach((v) => walk(v, visit)); return; }
  if (value && typeof value === 'object') { visit(value); Object.values(value).forEach((v) => walk(v, visit)); }
}

test('the build produces the core pages', () => {
  for (const path of ['/', '/programs/', '/find-your-program/', '/404', ...PROGRAMS.map((p) => p.url)]) {
    assert.ok(site.paths.includes(path), `${path} is built`);
  }
  assert.ok(site.paths.every((p) => p === '/404' || (p.startsWith('/') && p.endsWith('/'))), 'clean URLs end with a slash');
});

test('every page is a complete HTML document with exactly one main heading', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    if (!/^<!doctype html>/i.test(html)) problems.push(`${path}: does not start with <!doctype html>`);
    if (!/<html lang="en">/.test(html)) problems.push(`${path}: <html lang="en"> missing`);
    if (count(html, /<meta name="viewport"/g) !== 1) problems.push(`${path}: needs exactly one viewport meta`);
    if (count(html, /<meta charset="utf-8">/gi) !== 1) problems.push(`${path}: needs one charset meta`);
    const h1 = count(html, /<h1[\s>]/g);
    if (h1 !== 1) problems.push(`${path}: ${h1} <h1> elements`);
    if (!/<main id="main"/.test(html)) problems.push(`${path}: no <main id="main"> for the skip link`);
  }
  assert.deepEqual(problems, []);
});

test('titles and meta descriptions are unique and fit search results', () => {
  const problems = [];
  const titles = new Map();
  const descriptions = new Map();
  for (const { path, html } of site.pages) {
    const t = titleOf(html);
    const d = descriptionOf(html);
    if (!t) problems.push(`${path}: no <title>`);
    if (t.length > 70) problems.push(`${path}: title is ${t.length} characters (max 70): "${t}"`);
    if (d.length < 100 || d.length > 170) problems.push(`${path}: description is ${d.length} characters (100-170): "${d}"`);
    if (titles.has(t)) problems.push(`${path}: same title as ${titles.get(t)}`);
    if (descriptions.has(d)) problems.push(`${path}: same description as ${descriptions.get(d)}`);
    titles.set(t, path);
    descriptions.set(d, path);
  }
  assert.deepEqual(problems, []);
});

test('canonical links, robots and the content security policy', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    const canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1]);
    if (is404({ path })) { if (canon.length) problems.push(`${path}: the 404 page must not have a canonical link`); }
    else if (canon.length !== 1 || canon[0] !== SITE.origin + path) problems.push(`${path}: canonical ${JSON.stringify(canon)}, expected ${SITE.origin + path}`);

    const robots = /<meta name="robots" content="([^"]*)">/.exec(html)?.[1];
    const shouldIndex = SITE.indexable && !is404({ path });
    if (!robots) problems.push(`${path}: no robots meta`);
    else if (shouldIndex ? /noindex/.test(robots) : !/noindex/.test(robots)) problems.push(`${path}: robots "${robots}" while SITE.indexable is ${SITE.indexable}`);

    const csp = decode(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1] ?? '');
    if (!csp) problems.push(`${path}: no Content-Security-Policy meta`);
    const scriptSrc = /(?:^|;)\s*script-src ([^;]*)/.exec(csp)?.[1]?.trim();
    if (scriptSrc !== "'self'") problems.push(`${path}: script-src is "${scriptSrc}", expected 'self' only`);
  }
  assert.deepEqual(problems, []);
});

test('no inline scripts, inline event handlers or javascript: links (the CSP would block them)', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    for (const [, attrs, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\ssrc="/.test(attrs)) { if (content.trim()) problems.push(`${path}: a script with src also has inline code`); continue; }
      if (attr(attrs, 'type') !== 'application/ld+json') problems.push(`${path}: inline <script${attrs}>`);
    }
    for (const [tag] of html.matchAll(/<[a-z][a-z0-9-]*\s[^>]*>/gi)) {
      if (/\son[a-z]+\s*=/i.test(tag)) problems.push(`${path}: inline event handler in ${tag.slice(0, 80)}`);
      if (/=\s*"\s*javascript:/i.test(tag)) problems.push(`${path}: javascript: URL in ${tag.slice(0, 80)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('structured data parses and never claims reviews, ratings, events, people or videos', () => {
  const BANNED_TYPES = new Set(['Review', 'AggregateRating', 'Event', 'Person', 'VideoObject', 'EducationEvent']);
  const problems = [];
  for (const { path, html } of site.pages) {
    const blocks = jsonLd(html);
    if (!blocks.length) problems.push(`${path}: no JSON-LD at all`);
    for (const raw of blocks) {
      let data;
      try { data = JSON.parse(raw); } catch (e) { problems.push(`${path}: JSON-LD does not parse: ${e.message}`); continue; }
      walk(data, (o) => {
        for (const t of [].concat(o['@type'] ?? [])) if (BANNED_TYPES.has(t)) problems.push(`${path}: JSON-LD uses @type ${t}`);
        for (const k of ['aggregateRating', 'review', 'reviews', 'alumni']) if (k in o) problems.push(`${path}: JSON-LD has "${k}"`);
      });
    }
  }
  assert.deepEqual(problems, []);
});

const norm = (s) => decode(String(s)).replace(/\s+/g, ' ').trim().toLowerCase();

test('inner pages show breadcrumbs that match their BreadcrumbList', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    if (path === '/' || is404({ path })) continue;
    const nav = /<nav class="crumbs" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/.exec(html)?.[1];
    if (!nav) { problems.push(`${path}: no visible breadcrumbs`); continue; }
    const shown = [...nav.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => [/href="([^"]*)"/.exec(li)?.[1] ?? path, norm(visibleText(`<body>${li}</body>`))]);
    const lists = [];
    for (const raw of jsonLd(html)) walk(JSON.parse(raw), (o) => { if (o['@type'] === 'BreadcrumbList') lists.push(o); });
    if (lists.length !== 1) { problems.push(`${path}: ${lists.length} BreadcrumbList objects`); continue; }
    const items = lists[0].itemListElement ?? [];
    const listed = items.map((i) => [String(i.item).slice(SITE.origin.length), norm(i.name)]);
    if (JSON.stringify(listed) !== JSON.stringify(shown)) problems.push(`${path}: BreadcrumbList ${JSON.stringify(listed)} but the page shows ${JSON.stringify(shown)}`);
    if (items.at(-1)?.item !== SITE.origin + path) problems.push(`${path}: the last breadcrumb is ${items.at(-1)?.item}, not this page`);
    if (!items.every((it, i) => it.position === i + 1)) problems.push(`${path}: breadcrumb positions are not 1..n`);
  }
  assert.deepEqual(problems, []);
});

test('FAQ structured data only describes questions the page shows', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    const text = norm(visibleText(html));
    for (const raw of jsonLd(html)) {
      walk(JSON.parse(raw), (o) => {
        if (o['@type'] !== 'FAQPage') return;
        for (const q of o.mainEntity ?? []) {
          if (!text.includes(norm(q.name))) problems.push(`${path}: FAQ question not on the page: "${q.name}"`);
          const answer = norm(q.acceptedAnswer?.text ?? '');
          if (!answer || !text.includes(answer.slice(0, 60))) problems.push(`${path}: FAQ answer not on the page: "${answer.slice(0, 60)}"`);
        }
      });
    }
  }
  assert.deepEqual(problems, []);
});

test('no invented contact details while the owner has not published them', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    if (!OWNER.supportEmail && /href="mailto:/i.test(html)) problems.push(`${path}: a mailto: link, but no support email is published`);
    if (!OWNER.phone && /href="tel:/i.test(html)) problems.push(`${path}: a tel: link, but no phone number is published`);
    const text = visibleText(html);
    for (const [m] of text.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) problems.push(`${path}: an email address in the text: ${m}`);
    for (const [m] of text.matchAll(/\+\d{1,3}[\s-]?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}/g)) problems.push(`${path}: a phone number in the text: ${m}`);
  }
  assert.deepEqual(problems, []);
});

test('pages that show stock photos or clips say they are stock media', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    const body = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
    // Program covers (/img/covers/) are Nuvora's own drawn artwork with no people or photos (web/lib/covers.mjs),
    // so they are not stock media. Every other image under /img/ is a stock photo.
    const people = [...body.matchAll(/<img\b[^>]*src="\/img\/(?!covers\/)[^"]*"[^>]*>/g)].filter(([tag]) => attr(tag, 'alt')).length
      + count(body, /<video\b/g);
    if (people && !/\bstock (photo|video|clip|model|media|footage)s?\b/i.test(visibleText(`<body>${body}</body>`))) problems.push(`${path}: shows ${people} stock photo(s) or clip(s) without saying they are stock media`);
  }
  assert.deepEqual(problems, []);
});

test('every Course offers the next real batch, on the India-time schedule, at the published tuition', () => {
  const today = todayInKolkata();
  const problems = [];
  const courses = [];
  for (const { path, html } of site.pages) {
    for (const raw of jsonLd(html)) walk(JSON.parse(raw), (o) => { if (o['@type'] === 'Course') courses.push({ path, c: o }); });
  }
  for (const p of PROGRAMS) {
    const own = courses.filter(({ path, c }) => path === p.url && c.url === SITE.origin + p.url);
    if (own.length !== 1) problems.push(`${p.url}: ${own.length} Course objects for ${p.name}`);
  }
  for (const { path, c } of courses) {
    const p = PROGRAMS.find((x) => SITE.origin + x.url === c.url);
    if (!p) { problems.push(`${path}: Course "${c.name}" does not point at a program page (${c.url})`); continue; }
    const inst = c.hasCourseInstance ?? {};
    // One weekly Schedule per live session: the class and the office hours, each with its own day, time and length.
    const scheds = [].concat(inst.courseSchedule ?? []);
    const want = [[SCHEDULE.classDay, SCHEDULE.classTime, SCHEDULE.classMinutes], [SCHEDULE.officeDay, SCHEDULE.officeTime, SCHEDULE.officeMinutes]];
    const got = scheds.map((x) => [String([].concat(x.byDay ?? []).join()).replace('https://schema.org/', ''), x.startTime, Number(/^PT(\d+)M$/.exec(x.duration ?? '')?.[1])]);
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${path}: courseSchedule is ${JSON.stringify(got)}, expected the class and office hours ${JSON.stringify(want)}`);
    for (const k of ['timeRequired', 'numberOfCredits']) if (k in c) problems.push(`${path}: Course has ${k}, which cannot be stated as one true value`);
    if ('courseWorkload' in inst) problems.push(`${path}: CourseInstance has courseWorkload, but weekly hours are a range, not a total`);
    const dates = [['CourseInstance.startDate', inst.startDate]];
    for (const [i, sched] of scheds.entries()) {
      if (sched['@type'] !== 'Schedule' || sched.repeatFrequency !== 'P1W') problems.push(`${path}: courseSchedule[${i}] is not a weekly Schedule`);
      if (sched.scheduleTimezone !== 'Asia/Kolkata') problems.push(`${path}: courseSchedule[${i}].scheduleTimezone is ${sched.scheduleTimezone}`);
      if (sched.startDate !== inst.startDate || sched.endDate !== inst.endDate) problems.push(`${path}: courseSchedule[${i}] does not run with the batch`);
      dates.push([`courseSchedule[${i}].startDate`, sched.startDate]);
    }
    for (const [where, iso] of dates) {
      if (!iso) { problems.push(`${path}: no ${where}`); continue; }
      const d = fromIso(iso);
      if (d.getUTCDay() !== 1 || d.getUTCDate() > 7) problems.push(`${path}: ${where} ${iso} is not the first Monday of a month`);
      if (d - today < 7 * DAY) problems.push(`${path}: ${where} ${iso} is less than 7 days after today; seat requests for it are closed`);
    }
    if (inst.endDate && inst.startDate && fromIso(inst.endDate) - fromIso(inst.startDate) !== 83 * DAY) problems.push(`${path}: the batch does not run 12 weeks`);
    const offers = [].concat(c.offers ?? []);
    if (!offers.length) problems.push(`${path}: Course has no Offer`);
    for (const o of offers) {
      if (Number(o.price) !== TUITION.perTerm[p.level]) problems.push(`${path}: Offer price ${o.price}, tuition is ${TUITION.perTerm[p.level]} per term`);
      if (o.priceCurrency !== TUITION.currency) problems.push(`${path}: Offer currency ${o.priceCurrency}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every internal link and asset resolves to a built page or a file', async (t) => {
  const pageSet = new Set(site.paths);
  const broken = new Map();   // target -> pages linking to it
  const checked = new Map();
  const resolves = async (target) => {
    if (checked.has(target)) return checked.get(target);
    let ok = pageSet.has(target);
    if (!ok && !target.endsWith('/')) {
      const rel = decodeURIComponent(target).slice(1);
      ok = await isFile(join(site.outDir, rel)) || await isFile(resolve(ROOT, 'web/static', rel));
    }
    checked.set(target, ok);
    return ok;
  };
  for (const { path, html } of site.pages) {
    const refs = [...html.matchAll(/\s(?:href|src|poster|action)="([^"]*)"/gi)].map((m) => decode(m[1]));
    const og = /<meta property="og:image" content="([^"]*)">/.exec(html)?.[1];
    if (og) refs.push(og.startsWith(SITE.origin) ? og.slice(SITE.origin.length) : og);
    for (const ref of refs) {
      if (!ref.startsWith('/') || ref.startsWith('//')) continue;
      const target = ref.split('#')[0].split('?')[0];
      if (!target || target === '/portal' || target.startsWith('/portal/')) continue;
      if (!(await resolves(target))) broken.set(target, [...(broken.get(target) ?? []), path]);
    }
  }
  const report = [...broken].map(([target, from]) => `${target} (linked from ${[...new Set(from)].slice(0, 3).join(', ')}${from.length > 3 ? ', …' : ''})`);
  // While page modules are still being written, links into sections that have no built page at all are expected.
  // Once every module in scripts/build-site.mjs exists, every link must resolve.
  const missing = await missingPageModules();
  if (missing.length) {
    const sections = new Set(site.paths.map((p) => p.split('/')[1]));
    const pending = report.filter((r) => !sections.has(r.split('/')[1].split(' ')[0]) && !/^\/(css|js|img|video|fonts)\//.test(r));
    if (pending.length) t.diagnostic(`Links to pages not written yet (modules missing: ${missing.join(', ')}):\n  ${pending.join('\n  ')}`);
    assert.deepEqual(report.filter((r) => !pending.includes(r)), [], 'links into built sections and assets resolve');
  } else {
    assert.deepEqual(report, []);
  }
});

test('sitemap.xml lists exactly the indexable pages and robots.txt allows the site', async () => {
  const xml = await readFile(join(site.outDir, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.every((l) => l.startsWith(`${SITE.origin}/`)), 'sitemap URLs use the site origin');
  const listed = locs.map((l) => l.slice(SITE.origin.length));
  assert.equal(new Set(listed).size, listed.length, 'no URL is listed twice');
  assert.ok(!listed.includes('/404') && !listed.some((p) => p.startsWith('/portal')), 'no 404 page or portal in the sitemap');
  const indexable = site.pages.filter((p) => !is404(p) && /<link rel="canonical"/.test(p.html)).map((p) => p.path);
  assert.deepEqual([...listed].sort(), [...indexable].sort());

  const robots = await readFile(join(site.outDir, 'robots.txt'), 'utf8');
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, 'robots.txt must not block the whole site');
  assert.match(robots, /^Sitemap: \S+\/sitemap\.xml$/m);
});

test('no page makes claims Nuvora cannot back up', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    const text = visibleText(html);
    for (const line of text.split('\n')) {
      const m = BANNED.exec(line);
      if (m) problems.push(`${path}: "${m[0]}" in "…${line.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).trim()}…"`);
    }
    for (const bad of unnegatedAccredited(text)) problems.push(`${path}: accreditation not denied: "${bad}"`);
  }
  assert.deepEqual(problems, []);
});

test('no placeholder domains anywhere in the output', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    const m = /nuvora\.example|nuvora\.com|example\.(com|org|net)/i.exec(html);
    if (m) problems.push(`${path}: ${m[0]}`);
  }
  assert.deepEqual(problems, []);
});

test('every program page shows its key facts and says it is not an accredited degree', () => {
  const problems = [];
  for (const p of PROGRAMS) {
    const pg = site.pages.find((x) => x.path === p.url);
    if (!pg) { problems.push(`${p.url}: not built`); continue; }
    const block = /data-test="key-facts"[^>]*>([\s\S]*?)<\/dl>/.exec(pg.html)?.[1];
    if (!block) { problems.push(`${p.url}: no data-test=key-facts block`); continue; }
    const facts = visibleText(`<body>${block}</body>`);
    for (const want of [money(p.tuition.perTerm), p.duration, `${p.weeklyHours} hours`]) {
      if (!facts.includes(want)) problems.push(`${p.url}: key facts do not show "${want}"`);
    }
    if (!/not an accredited degree/i.test(visibleText(pg.html))) problems.push(`${p.url}: does not say "not an accredited degree"`);
  }
  assert.deepEqual(problems, []);
});

const flat = (html) => visibleText(html).replace(/\s+/g, ' ');
const pageAt = (path) => site.pages.find((x) => x.path === path);

test('the access rule for unpaid terms is published in the same words wherever it appears', () => {
  const problems = [];
  for (const path of ['/tuition/', '/admissions/', '/legal/terms/']) {
    const pg = pageAt(path);
    if (!pg) { problems.push(`${path}: not built`); continue; }
    if (!flat(pg.html).includes(ACCESS_RULE)) problems.push(`${path}: does not show the access rule word for word`);
  }
  // Anything that talks about the 30 days must be the published sentence, not a paraphrase.
  for (const { path, html } of site.pages) {
    const text = flat(html).split(ACCESS_RULE).join(' ');
    const m = /[^.]*\b30 days\b[^.]*\./i.exec(text);
    if (m) problems.push(`${path}: a different wording of the access rule: "${m[0].trim()}"`);
  }
  assert.deepEqual(problems, []);
});

test('the accessibility statement is honest and reachable from the other legal pages', () => {
  const pg = pageAt('/legal/accessibility/');
  assert.ok(pg, '/legal/accessibility/ is built');
  const text = flat(pg.html);
  for (const want of ['WCAG 2.2', 'level AA', 'We do not claim full conformance', 'no independent accessibility audit', 'Known limits',
    'screen readers', '320, 360, 390, 768 and 1280 pixels', 'Escape', 'reduced motion', 'Report a problem', 'October 3, 2026']) {
    assert.ok(text.includes(want), `the statement says "${want}"`);
  }
  assert.match(pg.html, /href="\/contact\/"/, 'problems are reported through the contact page');
  assert.doesNotMatch(text, /fully (accessible|conformant)|conforms to WCAG|100% accessible/i);
  for (const path of ['/legal/privacy/', '/legal/terms/', '/legal/credits/', '/contact/']) {
    assert.match(pageAt(path).html, /href="\/legal\/accessibility\/"/, `${path} links to the accessibility statement`);
  }
});

test('seat requests: one generic confirmation, no reference, and the saved plan is opt-in', () => {
  const html = pageAt('/admissions/').html;
  const text = flat(html);
  assert.doesNotMatch(html, /data-r="reference"|Keep your reference|already requested/i);
  assert.match(html, /data-result-title>Request received</);
  assert.ok(text.includes('Nuvora will reply by email to the address you gave'));
  const box = /<input type="checkbox" name="include_plan"[^>]*>/.exec(html)?.[0] ?? '';
  assert.ok(box, 'the include-plan box is on the page');
  assert.doesNotMatch(box, /\schecked\b/, 'the include-plan box starts unticked');
  for (const want of ['background, goal, weekly time and coding', 'bachelor’s degree', 'best match and its score']) {
    assert.ok(text.includes(want), `the plan hint says it sends "${want}"`);
  }
  const privacy = flat(pageAt('/legal/privacy/').html);
  assert.ok(privacy.includes('A request can only be confirmed through the email address given in it'));
});

test('the privacy notice names every Google font and what administrators can see', () => {
  const text = flat(pageAt('/legal/privacy/').html);
  for (const font of ['Plus Jakarta Sans', 'Source Serif 4', 'Outfit', 'JetBrains Mono']) assert.ok(text.includes(font), `names ${font}`);
  assert.ok(text.includes('payment records and access history'), 'says administrators can see payment records and access history');
});

test('heading levels never skip on any page (an h2 before an h3, an h3 before an h4)', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    let prev = 0;
    for (const m of html.matchAll(/<h([1-6])[\s>][\s\S]*?<\/h\1>/g)) {
      const level = Number(m[1]);
      if (prev && level > prev + 1) problems.push(`${path}: h${prev} then h${level} "${visibleText(m[0]).trim().slice(0, 40)}"`);
      prev = level;
    }
  }
  assert.deepEqual(problems, []);
});

test('the Meta-logo blues lead: none of the replaced blues, and no magenta or teal topic colours, are left', async () => {
  // Replaced on 2026-10-03 (owner request): the old blues, plus the off-palette topic and program colours.
  const OLD = ['#0B6BF5', '#0A4FC4', '#2B8CFF', '#2A45D8', '#123C9C', '#4DA8FF', '#9CD0FF', '#E6F3FF', '#10284D',
    '#4338CA', '#4C1D95', '#C026D3', '#14B8A6', '#0E7490', '#2DD4BF', '#1E1B7B', 'rgb(11 107 245', 'rgb(67 56 202'];
  const { readdir } = await import('node:fs/promises');
  const files = async (dir) => (await readdir(dir, { withFileTypes: true, recursive: true }))
    .filter((e) => e.isFile() && /\.(css|m?js)$/.test(e.name)).map((e) => join(e.parentPath ?? e.path, e.name));
  const problems = [];
  for (const f of await files(resolve(ROOT, 'web'))) {
    const text = (await readFile(f, 'utf8')).toUpperCase();
    for (const c of OLD) if (text.includes(c.toUpperCase())) problems.push(`${f.slice(ROOT.length)}: ${c}`);
  }
  assert.deepEqual(problems, []);
});
