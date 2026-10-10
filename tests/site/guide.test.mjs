// The program guides (/programs/<slug>/guide/) and the page-by-page brochures (/programs/<slug>/brochure/), as built:
// both exist for every program, every fact on them matches the data modules (checked here against the catalog
// itself, not against web/lib/guide-data.mjs), nothing from the reference artwork leaks in (claude.ai links, QR codes,
// Zoom, India time, AR), images are described and sized, there is no PDF brochure to download (the owner decided on
// 10 Oct that the pages are enough; visitors can print them), and the old
// "not connected yet" brochure request form is gone everywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildForTest, visibleText, decode, ROOT } from './helpers.mjs';
import { PROGRAMS as CATALOG_PROGRAMS, TERMS, TUITION, LIVE_PATTERN } from '../../scripts/catalog.mjs';
import { PROGRAMS, money, nextStarts, termDates, fmtDay, isoDay } from '../../web/data/programs.mjs';
import { OWNER, RUBRIC, SITE } from '../../web/data/site.mjs';
import { ROLES } from '../../web/data/careers.mjs';
import { CERT_DISCLAIMER, CHECKED, certsFor } from '../../web/data/certs.mjs';
import guides from '../../web/pages/guide.mjs';
import brochures from '../../web/pages/brochure.mjs';

let site;
before(async () => { site = await buildForTest(); });
after(() => site?.cleanup());

const CREDENTIAL_LINE = 'Nuvora certificate of completion · not an accredited degree';
const guidePath = (p) => `${p.url}guide/`;
const brochurePath = (p) => `${p.url}brochure/`;
const pageAt = (path) => site.pages.find((p) => p.path === path)?.html ?? '';
const mainOf = (html) => /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
const flat = (html) => visibleText(`<body>${html}</body>`).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>/])`, 'i').exec(tag); return m ? decode(m[1] ?? '') : null; };
/** The visible text of every element marked data-fact="name". */
const facts = (html, name) => [...html.matchAll(new RegExp(`<(\\w+)[^>]*\\sdata-fact="${name}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))].map((m) => flat(m[2]));
/** The HTML of the term card data-term="n" (up to the next one). */
const termBlock = (html, n) => { const i = html.indexOf(`data-term="${n}"`); if (i < 0) return ''; const j = html.indexOf('data-term="', i + 10); return html.slice(i, j < 0 ? undefined : j); };
const week = (day) => Math.ceil(day / 7);
const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
const isFile = async (f) => Boolean((await stat(f).catch(() => null))?.isFile());

test('every program has a guide and a brochure; the guide is indexable, the brochure is noindex and out of the sitemap', async () => {
  const sitemap = await readFile(join(site.outDir, 'sitemap.xml'), 'utf8');
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) assert.ok(site.paths.includes(path), `${path} is built`);
    const g = pageAt(guidePath(p));
    const b = pageAt(brochurePath(p));
    assert.match(g, new RegExp(`<link rel="canonical" href="[^"]*${guidePath(p)}">`), `${p.id}: the guide is canonical to itself`);
    assert.ok(sitemap.includes(`${guidePath(p)}</loc>`), `${p.id}: the guide is in the sitemap`);
    assert.ok(!sitemap.includes(`${brochurePath(p)}</loc>`), `${p.id}: the brochure is not in the sitemap`);
    // Pre-launch every page is "noindex, nofollow"; once the site is indexable, the brochure is noindex but followed.
    const robots = SITE.indexable ? 'noindex, follow' : 'noindex, nofollow';
    assert.match(b, new RegExp(`<meta name="robots" content="${robots}">`), `${p.id}: the brochure's robots is "${robots}"`);
    assert.match(g, /<link rel="stylesheet" href="\/css\/guide\.css">/);
    assert.match(b, /<link rel="stylesheet" href="\/css\/guide\.css">/);
    assert.match(b, /<script type="module" src="\/js\/guide\.js"><\/script>/, 'the viewer script loads on the brochure');
  }
});

test('the guide stylesheet and script load only on guide and brochure pages', () => {
  for (const { path, html } of site.pages) {
    if (/\/(guide|brochure)\/$/.test(path)) continue;
    assert.doesNotMatch(html, /\/css\/guide\.css|\/js\/guide\.js/, `${path}: no guide.css or guide.js`);
  }
});

test('the facts on each guide and brochure match the catalog: tuition, duration, hours, terms, projects and next start', () => {
  const next = nextStarts(1)[0].start;
  for (const p of PROGRAMS) {
    const core = CATALOG_PROGRAMS.find((x) => x.id === p.id);
    const terms = TERMS[p.id];
    const perTerm = TUITION.perTerm[core.level];
    const projects = terms.reduce((n, t) => n + t.projects.length, 0);
    for (const path of [guidePath(p), brochurePath(p)]) {
      const html = mainOf(pageAt(path));
      const want = {
        duration: [p.duration], weekly: [`${p.weeklyHours} hours`], terms: [plural(terms.length, 'term')], projects: [`${projects} graded projects`],
        'tuition-per-term': [money(perTerm)], 'tuition-total': [money(perTerm * terms.length)], 'term-count': [String(terms.length)],
        'application-fee': [`${money(TUITION.applicationFee)}, once`],
      };
      for (const [name, values] of Object.entries(want)) {
        const got = facts(html, name);
        assert.ok(got.length >= 1, `${path}: shows ${name}`);
        for (const g of got) assert.ok(values.includes(g), `${path}: ${name} is "${g}", expected ${values.join(' or ')}`);
      }
      const start = [...html.matchAll(/data-fact="next-start"[^>]*>\s*<time datetime="([^"]+)" data-date="start" data-n="0">([^<]+)<\/time>/g)];
      assert.ok(start.length >= 1, `${path}: the next start is a live date`);
      for (const [, iso, text] of start) {
        assert.equal(iso, isoDay(next), `${path}: next start date`);
        assert.equal(text, fmtDay(next), `${path}: next start text`);
      }
    }
  }
});

test('every term title, lesson (with its code) and graded project (with its week) is on the guide and in the brochure', () => {
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) {
      const html = mainOf(pageAt(path));
      TERMS[p.id].forEach((t, i) => {
        const block = termBlock(html, i + 1);
        assert.ok(block, `${path}: term ${i + 1} is shown`);
        const text = flat(block);
        assert.ok(text.includes(t.title), `${path}: term ${i + 1} title "${t.title}"`);
        assert.ok(text.includes(`Skill badge: ${t.badge}`), `${path}: term ${i + 1} badge`);
        // Each item: its data attribute and the text of its first two spans (code and title, or week and title).
        const items = (name) => [...block.matchAll(new RegExp(`<li ${name}="([^"]+)">([\\s\\S]*?)</li>`, 'g'))]
          .map((m) => [m[1], ...[...m[2].matchAll(/<span[^>]*>([^<]*)/g)].slice(0, 2).map((s) => decode(s[1]).trim())]);
        assert.deepEqual(items('data-lesson'), t.lessons.map(([code, title]) => [code, code, title]), `${path}: term ${i + 1} lessons with their codes`);
        assert.deepEqual(items('data-project-week'), t.projects.map(([title, day]) => [String(week(day)), `Wk ${week(day)}`, title]), `${path}: term ${i + 1} projects with their weeks`);
      });
      assert.equal(termBlock(html, TERMS[p.id].length + 1), '', `${path}: no extra terms`);
    }
  }
});

test('the brochure: A4 pages labelled "Page N of M", running headers, 4 terms per learning-path page and no QR code', () => {
  for (const p of PROGRAMS) {
    const html = mainOf(pageAt(brochurePath(p)));
    const pages = [...html.matchAll(/<article class="gb-page[^"]*" id="page-(\d+)" aria-label="([^"]+)"/g)];
    const total = pages.length;
    const termPages = Math.ceil(TERMS[p.id].length / 4);
    assert.equal(total, 8 + termPages, `${p.id}: cover, fit, outcomes, learning system, ${termPages} learning-path page(s), projects, careers, tuition and back page`);
    pages.forEach(([, n, label], i) => {
      assert.equal(Number(n), i + 1, `${p.id}: pages are numbered in order`);
      assert.equal(label, `Page ${i + 1} of ${total}`, `${p.id}: page ${i + 1} label`);
    });
    const articles = html.split('<article class="gb-page').slice(1);
    articles.forEach((a, i) => {
      if (i) assert.ok(flat(a).includes(`Program guide · ${p.name}`), `${p.id}: page ${i + 1} has the running header`);
      assert.match(a, new RegExp(`<span class="gb-pn" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>`), `${p.id}: page ${i + 1} shows its number`);
    });
    const pathPages = articles.filter((a) => /class="gb-path/.test(a.slice(0, 40)) || /^ gb-path/.test(a));
    assert.equal(pathPages.length, termPages, `${p.id}: ${termPages} learning-path page(s)`);
    for (const a of pathPages) assert.ok((a.match(/<li class="st-term"/g) ?? []).length <= 4, `${p.id}: at most 4 terms on a page`);
    const cover = articles[0];
    assert.match(cover, new RegExp(`<img src="/img/guides/${p.slug}-hero\\.jpg"`), `${p.id}: the cover shows the hero render`);
    assert.ok(flat(cover).includes('Online · recorded lessons plus two live Jitsi sessions a week'), `${p.id}: cover footer line`);
    assert.doesNotMatch(html, /\bQR\b|qr-?code/i, `${p.id}: no QR code`);
  }
});

test('the credential line, the rubric, the 12-week rhythm, roles and certifications are stated as the site states them', () => {
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) {
      const html = mainOf(pageAt(path));
      const text = flat(html);
      assert.ok(text.includes(CREDENTIAL_LINE), `${path}: the credential line`);
      for (const [name, desc] of RUBRIC) assert.ok(text.includes(name) && text.includes(desc), `${path}: rubric level ${name}`);
      assert.ok(text.includes('Proficient or better passes. Below that, you get written feedback and resubmit.'), `${path}: the resubmission rule`);
      assert.ok(text.includes(`Live class · Tuesday ${LIVE_PATTERN.classTime} ET · ${LIVE_PATTERN.classMinutes} min`), `${path}: class time in ET`);
      assert.ok(text.includes(`Office hours · Thursday ${LIVE_PATTERN.officeTime} ET · ${LIVE_PATTERN.officeMinutes} min`), `${path}: office hours in ET`);
      const strip = /<ol class="st-strip">([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? '';
      assert.equal((strip.match(/<li/g) ?? []).length, 12, `${path}: 12 weeks in the strip`);
      const due = [...strip.matchAll(/<li class="due">[\s\S]*?<b>(\d+)<\/b>/g)].map((m) => Number(m[1]));
      assert.deepEqual(due, [...new Set(TERMS[p.id][0].projects.map(([, d]) => week(d)))], `${path}: project weeks in the strip`);
      for (const id of p.roles) {
        assert.match(html, new RegExp(`href="/careers/${id}/"`), `${path}: links to the ${id} career page`);
        assert.ok(text.includes(ROLES[id].title));
      }
      for (const c of certsFor(p.id)) assert.ok(text.includes(c.name), `${path}: certification ${c.name}`);
      assert.ok(text.includes(CERT_DISCLAIMER), `${path}: the "not affiliated" wording`);
      assert.ok(text.includes('Pay per term. Loans, instalments within a term and scholarships are not offered yet.'), `${path}: financing`);
      if (!OWNER.refundPolicy) assert.ok(text.includes('The policy will be published before the first batch, and you will see it before you pay.'), `${path}: refunds not invented`);
    }
  }
});

test('the four join steps match the admissions page, and the guide has one h1 and a picker that marks the current program', () => {
  const admissions = pageAt('/admissions/');
  const steps = [...admissions.matchAll(/<h3><span class="sr-only">Step (\d): <\/span>([^<]+)<\/h3>/g)].map((m) => decode(m[2]));
  assert.equal(steps.length, 4, 'the admissions page has four steps');
  for (const p of PROGRAMS) {
    const g = mainOf(pageAt(guidePath(p)));
    const shown = [...g.matchAll(/<h3><span class="sr-only">Step (\d): <\/span>([^<]+)<\/h3>/g)].map((m) => decode(m[2]));
    assert.deepEqual(shown, steps, `${p.id}: the same four steps as /admissions/`);
    assert.equal((pageAt(guidePath(p)).match(/<h1[\s>]/g) ?? []).length, 1, `${p.id}: one h1`);
    const picker = /<nav class="gd-picker" aria-label="Program guides">([\s\S]*?)<\/nav>/.exec(g)?.[1] ?? '';
    const links = [...picker.matchAll(/<a href="([^"]+)"([^>]*)>/g)];
    assert.deepEqual(links.map((m) => m[1]), PROGRAMS.map(guidePath), `${p.id}: the picker links every guide`);
    assert.deepEqual(links.filter((m) => /aria-current="page"/.test(m[2])).map((m) => m[1]), [guidePath(p)], `${p.id}: only the current guide is marked`);
    const crumbs = flat(/<nav class="crumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(g)?.[1] ?? '');
    assert.equal(crumbs, `Home / Programs / ${p.name} / Program guide`.replace(/ \/ /g, ' '), `${p.id}: breadcrumbs`);
    assert.match(g, new RegExp(`<a class="btn gold" href="/admissions/\\?program=${p.id}#request"`), `${p.id}: Request a seat`);
    assert.match(g, new RegExp(`href="${brochurePath(p)}"[^>]*>[\\s\\S]{0,400}?Read the brochure`), `${p.id}: Read the brochure`);
    assert.match(g, new RegExp(`<button class="btn ghost" type="button" data-preview3d-trigger data-program-id="${p.id}" aria-haspopup="dialog"`), `${p.id}: the 3D preview reuses the existing dialog`);
  }
});

test('nothing from the reference artwork leaks in: no claude.ai links, QR codes, Zoom, India time, AR or model-viewer', async () => {
  const BAD = /claude\.ai|\/artifact\b|\bQR\b|\bZoom\b|\bIST\b|India|Kolkata|\bAR\b|augmented reality|place it in your space|model-viewer|webxr|camera/i;
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) {
      const html = pageAt(path);
      const m = BAD.exec(visibleText(html)) ?? BAD.exec(mainOf(html));
      assert.equal(m, null, `${path}: "${m?.[0]}"`);
    }
  }
  for (const f of ['web/assets/js/guide.js', 'web/assets/css/guide.css', 'web/pages/guide.mjs', 'web/pages/brochure.mjs', 'web/lib/guide-data.mjs', 'web/lib/guide-ui.mjs']) {
    const m = BAD.exec(await readFile(resolve(ROOT, f), 'utf8'));
    assert.equal(m, null, `${f}: "${m?.[0]}"`);
  }
});

test('every image on the guides and brochures has alt text (empty only when decorative), a width and a height', () => {
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) {
      const imgs = [...mainOf(pageAt(path)).matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      assert.ok(imgs.length >= 2, `${path}: has images`);
      for (const tag of imgs) {
        assert.notEqual(attr(tag, 'alt'), null, `${path}: alt on ${tag.slice(0, 80)}`);
        assert.match(attr(tag, 'width') ?? '', /^\d+$/, `${path}: width on ${tag.slice(0, 80)}`);
        assert.match(attr(tag, 'height') ?? '', /^\d+$/, `${path}: height on ${tag.slice(0, 80)}`);
      }
      const hero = imgs.find((t) => t.includes(`/img/guides/${p.slug}-hero.jpg`));
      assert.ok(hero, `${path}: the hero render`);
      assert.equal(attr(hero, 'alt'), `3D illustration of the ${p.name} program guide`, `${path}: hero alt text`);
      assert.equal(attr(hero, 'fetchpriority'), 'high', `${path}: the hero loads first`);
      assert.equal(attr(hero, 'loading'), null, `${path}: the hero is not lazy`);
      for (const tag of imgs.filter((t) => t.includes('-motif.jpg'))) assert.equal(attr(tag, 'alt'), '', `${path}: the motif is decorative`);
    }
  }
});

test('there is no PDF brochure to download: the guide and brochure pages are the brochure, and the brochure prints', async () => {
  const src = await readFile(resolve(ROOT, 'scripts/build-site.mjs'), 'utf8');
  assert.doesNotMatch(src, /const MEDIA = \[[^\]]*'pdf'/, 'no PDF brochure folder is copied into the build');
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) {
      const html = pageAt(path);
      assert.doesNotMatch(html, /PDF brochure|-brochure\.pdf|data-pdf-link/, `${path}: offers a PDF brochure`);
    }
    assert.match(pageAt(brochurePath(p)), /data-gb-print/, `${brochurePath(p)}: has the print button`);
  }
});

test('the program cards link to the brochure, and every program page links to its guide and its brochure', () => {
  for (const path of ['/', '/programs/']) {
    const html = pageAt(path);
    for (const p of PROGRAMS) {
      const card = new RegExp(`<article class="pcard ccard" data-program="${p.id}"[\\s\\S]*?</article>`).exec(html)?.[0] ?? '';
      const link = /<a\b[^>]*data-brochure-link[^>]*>([^<]*)<\/a>/.exec(card);
      assert.ok(link, `${path} ${p.id}: the card has a Brochure link`);
      assert.equal(attr(link[0], 'href'), brochurePath(p), `${path} ${p.id}: it opens the brochure`);
      assert.equal(attr(link[0], 'aria-label'), `${p.name} brochure`, `${path} ${p.id}: accessible name`);
      assert.equal(link[1], 'Brochure', `${path} ${p.id}: visible label`);
      assert.match(attr(link[0], 'class'), /^btn ghost sm$/, `${path} ${p.id}: the same look as before`);
    }
  }
  for (const p of PROGRAMS) {
    const block = /data-test="guide-links">([\s\S]*?)<\/p>/.exec(pageAt(p.url))?.[1] ?? '';
    assert.match(block, new RegExp(`href="${guidePath(p)}"[^>]*>[\\s\\S]*?Program guide</a>`), `${p.url}: links its guide`);
    assert.match(block, new RegExp(`href="${brochurePath(p)}"[^>]*>[\\s\\S]*?Read the brochure</a>`), `${p.url}: links its brochure`);
  }
});

test('the brochure request form is gone: no brochure.js, no hooks, no promise to send a brochure', async () => {
  assert.equal(await isFile(resolve(ROOT, 'web/assets/js/brochure.js')), false, 'web/assets/js/brochure.js is deleted');
  assert.equal(await isFile(join(site.outDir, 'js/brochure.js')), false, 'and not built');
  for (const { path, html } of site.pages) {
    assert.doesNotMatch(html, /brochure\.js|data-brochure-trigger|data-brochure-root|brochure-modal|data-brochure-form/, `${path}: no trace of the form`);
    const m = /(send|email|mail)(ing)? (you )?(the|a|our) brochure|brochure requests?|request (the|a) brochure|brochure[^.]{0,40}not connected/i.exec(visibleText(html));
    assert.equal(m, null, `${path}: "${m?.[0]}"`);
  }
  for (const f of ['web/assets/js/site.js', 'web/lib/layout.mjs', 'web/lib/components.mjs', 'web/assets/css/showcase.css', 'web/assets/css/site.css']) {
    assert.doesNotMatch(await readFile(resolve(ROOT, f), 'utf8'), /brochure\.js|data-brochure-trigger|brochure-modal|openBrochure/, `${f}: no trace of the form`);
  }
});

test('money on the guides and brochures: the FAQ cost answer, the Tuition tile and the fee in join step 4 follow the catalog', () => {
  for (const p of PROGRAMS) {
    const core = CATALOG_PROGRAMS.find((x) => x.id === p.id);
    const n = TERMS[p.id].length;
    const per = money(TUITION.perTerm[core.level]);
    const fee = money(TUITION.applicationFee);
    const g = flat(mainOf(pageAt(guidePath(p))));
    const cost = n === 1
      ? `${per} for the term, plus a one-time ${fee} application fee.`
      : `${per} per term for ${n} terms, ${money(TUITION.perTerm[core.level] * n)} in total, plus a one-time ${fee} application fee.`;
    assert.ok(g.includes(`What does it cost in total? ${cost}`), `${p.id}: the FAQ cost answer is "${cost}"`);
    for (const path of [guidePath(p), brochurePath(p)]) {
      assert.ok(flat(mainOf(pageAt(path))).includes(`pay the one-time ${fee} application fee and pay for your first term`), `${path}: step 4 names the ${fee} application fee`);
    }
    const tile = /<span class="st-k">Tuition<\/span><b>([\s\S]*?)<\/b>/.exec(mainOf(pageAt(brochurePath(p))))?.[1] ?? '';
    assert.equal(flat(tile), `${per} per term`, `${p.id}: the brochure's Tuition tile`);
  }
});

test('the brochure’s term-dates table has one row per term, with the dates of the next start', () => {
  const start = nextStarts(1)[0].start;
  for (const p of PROGRAMS) {
    const table = /<table class="gb-starts"[\s\S]*?<\/table>/.exec(mainOf(pageAt(brochurePath(p))))?.[0] ?? '';
    const rows = [...table.matchAll(/<tr data-term="(\d+)">([\s\S]*?)<\/tr>/g)].map((m) => [Number(m[1]), ...[...m[2].matchAll(/<time datetime="([^"]+)">([^<]+)<\/time>/g)].flatMap((t) => [t[1], t[2]])]);
    const want = termDates(start, TERMS[p.id].length).map((r) => [r.term, isoDay(r.start), fmtDay(r.start), isoDay(r.end), fmtDay(r.end)]);
    assert.deepEqual(rows, want, `${p.id}: ${want.length} rows with each term's start and end`);
    TERMS[p.id].forEach((t, i) => assert.ok(flat(table).includes(t.title), `${p.id}: row ${i + 1} names "${t.title}"`));
  }
});

test('every lesson code on a guide or brochure belongs to that program (no other program’s lessons, no lesson-to-project mapping)', () => {
  for (const p of PROGRAMS) {
    const own = new Set(TERMS[p.id].flatMap((t) => t.lessons.map(([code]) => code)));
    for (const path of [guidePath(p), brochurePath(p)]) {
      const html = mainOf(pageAt(path));
      const codes = [...html.matchAll(/<span class="st-code">([^<]+)<\/span>/g)].map((m) => decode(m[1]));
      assert.ok(codes.length >= own.size, `${path}: lesson codes are shown`);
      const foreign = [...new Set(codes.filter((c) => !own.has(c)))];
      assert.deepEqual(foreign, [], `${path}: codes of lessons this program does not teach`);
      assert.doesNotMatch(flat(html), /\bAssesses\b/, `${path}: no project-to-lesson mapping`);
    }
    // The brochure's roles page lists, under each role, only skills this program teaches.
    for (const id of p.roles) {
      const card = new RegExp(`<a href="/careers/${id}/">([\\s\\S]*?)</a></li>`).exec(mainOf(pageAt(brochurePath(p))))?.[1] ?? '';
      const listed = [...card.matchAll(/<span class="st-code">([^<]+)<\/span>/g)].map((m) => m[1]);
      const taught = ROLES[id].skills.map(([, code]) => code).filter((c) => own.has(c)).slice(0, 4);
      assert.deepEqual(listed, taught, `${p.id} ${id}: the role's skills this program teaches`);
      if (listed.length) assert.ok(flat(card).includes('This program teaches'), `${p.id} ${id}: the list is labelled`);
    }
  }
});

test('certifications show their status note and the date they were checked; nothing claims Jitsi attendance is imported', () => {
  const checkedOn = new Date(`${CHECKED}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  for (const p of PROGRAMS) {
    for (const path of [guidePath(p), brochurePath(p)]) {
      const text = flat(mainOf(pageAt(path)));
      for (const c of certsFor(p.id)) if (c.status) assert.ok(text.includes(c.status), `${path}: the status of ${c.name}`);
      assert.ok(text.includes(`Checked on each company’s official page on ${checkedOn}.`), `${path}: the date the certifications were checked`);
    }
  }
  // /about/ lists the Jitsi attendance import under "Not yet", so no page may state it as working today.
  for (const { path, html } of site.pages) {
    assert.doesNotMatch(visibleText(html), /attendance is recorded from Jitsi/i, `${path}: Jitsi attendance stated as working`);
  }
});

test('the guides’ copy: one-term programs are not described as "each term", and the coding answer reads as an answer', () => {
  for (const p of PROGRAMS) {
    const text = flat(mainOf(pageAt(guidePath(p))));
    const n = TERMS[p.id].length;
    const coding = /Do I need to know how to code\? (.*?)(?= What does it cost)/.exec(text)?.[1] ?? '';
    assert.match(coding, p.requiresCoding ? /^Yes\. You need [a-zA-Z]/ : /^No\. /, `${p.id}: "${coding}"`);
    assert.doesNotMatch(coding, /You need:|; A |None:|needed:/, `${p.id}: "${coding}"`);
    if (p.needsBachelor) assert.match(coding, /joining also needs a bachelor’s degree/, `${p.id}: the degree is named as a joining rule`);
    assert.doesNotMatch(text, /at your own time|only ever charged/, `${p.id}: copy fixes`);
    if (n === 1) {
      assert.doesNotMatch(text, /\b1 term of 12 weeks|Each term has|per term\)/, `${p.id}: one-term wording`);
      assert.ok(text.includes('One 12-week term with 4 competency lessons'), `${p.id}: the one-term lede`);
    }
  }
});

test('no page says lesson videos or class recordings can be downloaded (only PDFs download)', () => {
  const NEG = /\b(never|not|no|cannot|only)\b|can’t|isn’t/i;
  for (const { path, html } of site.pages) {
    const sentences = visibleText(html).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      if (!/download/i.test(s) || s.trim().endsWith('?') || NEG.test(s)) continue;
      const media = /video|recording/i.test(s);
      const lessons = /\blessons?\b/i.test(s) && !/PDF|notes|briefs|sheets/i.test(s);
      assert.ok(!media && !lessons, `${path}: "${s.slice(0, 160)}"`);
    }
  }
});
