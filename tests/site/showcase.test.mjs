// The showcase parts of the website: the program catalog with its cover art, the certificates section with the
// industry certifications, and the footer. Checks the built pages, the generated covers and the certification data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildForTest, visibleText, decode } from './helpers.mjs';
import { PROGRAMS, TOPICS } from '../../web/data/programs.mjs';
import { OWNER } from '../../web/data/site.mjs';
import { CERTS, PROGRAM_CERTS, CHECKED, CERT_DISCLAIMER, certsFor } from '../../web/data/certs.mjs';
import { COVERS, coverUrl, coverAlt, brochureCoverUrl, brochureCoverAlt } from '../../web/lib/covers.mjs';
import { footer, socialLinks, FOOTER_COLUMNS } from '../../web/lib/layout.mjs';

let site;
before(async () => { site = await buildForTest(); });
after(() => site?.cleanup());

const pageAt = (path) => site.pages.find((p) => p.path === path).html;
const between = (html, start, end) => { const i = html.indexOf(start); return i < 0 ? '' : html.slice(i, html.indexOf(end, i + start.length)); };
const catalogOf = (html) => between(html, 'data-catalog ', '<p class="ccat-note"');
const footerOf = (html) => between(html, '<footer class="sitefoot"', '</footer>');
const proofOf = (html) => between(html, '<section class="sec proof"', '</section>');
const hrefs = (html) => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => decode(m[1]));
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]));

/** Problems with an internal link: the page must be built and a #fragment must be an id on that page. */
function linkProblem(href) {
  if (!href.startsWith('/')) return `${href}: not a site link`;
  const [path, frag] = href.split('#');
  if (path === '/portal/') return null;                         // the student portal is served beside the site
  const target = site.pages.find((p) => p.path === path);
  if (!target) return `${href}: no built page`;
  if (frag && !idsOf(target.html).has(frag)) return `${href}: no #${frag} on ${path}`;
  return null;
}

test('every catalog card links to its built program page and its brochure, and every program appears once', () => {
  for (const path of ['/', '/programs/']) {
    const cat = catalogOf(pageAt(path));
    assert.ok(cat, `${path} has the catalog`);
    const cards = [...cat.matchAll(/<article class="pcard ccard" data-program="([^"]+)"[\s\S]*?<\/article>/g)];
    assert.deepEqual(cards.map((m) => m[1]).sort(), PROGRAMS.map((p) => p.id).sort(), `${path}: one card per program`);
    for (const [card, id] of cards) {
      const p = PROGRAMS.find((x) => x.id === id);
      const links = hrefs(card);
      assert.deepEqual(links, [p.url, `${p.url}brochure/`], `${path}: the ${id} card links to its program page and its brochure`);
      assert.equal(linkProblem(p.url), null);
      assert.equal(linkProblem(`${p.url}brochure/`), null);
      assert.match(card, /data-match-badge hidden/, 'the "Your match" hook site.js uses is there');
      assert.match(card, new RegExp(`<img class="ccard-book-face" src="${brochureCoverUrl(p)}" alt="[^"]{30,}"`), `${id}: the portrait brochure cover has alt text`);
      assert.match(card, /class="ccard-book-pages"/, `${id}: the cover has 3D page depth`);
      assert.match(card, /class="ccard-3d-tag"/, `${id}: the card identifies its 3D program guide`);
    }
    // Topic tabs come from the programs' topics, each a toggle button; no JavaScript means every card shows.
    for (const t of TOPICS) assert.match(cat, new RegExp(`<button type="button" aria-pressed="false" data-topic="${t}">`));
    assert.doesNotMatch(cat, /<article[^>]*\shidden/, 'no card is hidden in the HTML');
  }
  assert.match(pageAt('/'), /data-limit="3"/, 'the home page shows three cards before "Show more"');
});

test('each program has a cover file: original SVG art, no photos, people or outside images', async () => {
  for (const p of PROGRAMS) {
    assert.ok(COVERS[p.id], `${p.id} has cover art`);
    const svg = await readFile(join(site.outDir, ...coverUrl(p).split('/').filter(Boolean)), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${p.id}: an SVG document`);
    assert.doesNotMatch(svg, /<image|<foreignObject|<script|href="http|url\(http/i, `${p.id}: no embedded or outside images`);
    assert.ok(svg.includes(`<title id="t">${coverAlt(p).replace(/&/g, '&amp;')}</title>`), `${p.id}: the SVG has the same title as the alt text`);
    for (const line of COVERS[p.id].label) assert.ok(svg.includes(`>${line.replace(/&/g, '&amp;')}</text>`), `${p.id}: label "${line}"`);
    assert.doesNotMatch(coverAlt(p), /student|person|people|learner/i, `${p.id}: the alt text describes artwork, not people`);
    assert.doesNotMatch(coverAlt(p), /\bAi\b|\bMl\b|Mlops/, `${p.id}: acronyms keep their capitals in the alt text`);
  }
});

test('each program card has a high-definition portrait SVG brochure cover with its own vector motif', async () => {
  for (const p of PROGRAMS) {
    const svg = await readFile(join(site.outDir, ...brochureCoverUrl(p).split('/').filter(Boolean)), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 480 640"/);
    assert.ok(svg.includes(`<title id="t">${brochureCoverAlt(p).replace(/&/g, '&amp;')}</title>`), `${p.id}: the SVG has descriptive title text`);
    assert.doesNotMatch(svg, /<image|<foreignObject|<script|href="http|url\(http/i, `${p.id}: artwork is vector-only and local`);
    for (const line of COVERS[p.id].label) assert.ok(svg.includes(`>${line.replace(/&/g, '&amp;')}</text>`), `${p.id}: includes its ${line} motif label`);
  }
});

test('cover labels: the gold dash sits the same distance above every label, and there is no tiny corner wordmark', async () => {
  const gaps = {};
  for (const p of PROGRAMS) {
    const svg = await readFile(join(site.outDir, ...coverUrl(p).split('/').filter(Boolean)), 'utf8');
    // A corner wordmark would render about 7px tall on a card, and the card's brand row already names Nuvora.
    assert.doesNotMatch(svg, />nuvora<\/text>/i, `${p.id}: no corner wordmark`);
    const dash = Number(/<rect x="36" y="([\d.]+)" width="40" height="5"/.exec(svg)?.[1]);
    const pill = Number(/<rect x="\d+" y="([\d.]+)"[^>]*fill="url\(#pill\)"/.exec(svg)?.[1]);
    // The label's top edge: the cap height of the first plain line, or the pill when the label is one line.
    const upper = [...svg.matchAll(/<text x="36" y="([\d.]+)"[^>]*font-size="(\d+)"/g)].map((m) => Number(m[1]) - Number(m[2]) * 0.72);
    gaps[p.id] = Math.round((upper.length ? Math.min(...upper) : pill) - dash);
  }
  assert.ok(Object.values(gaps).every((g) => g > 0), `the dash is above the label: ${JSON.stringify(gaps)}`);
  assert.equal(new Set(Object.values(gaps)).size, 1, `the same gap on every cover: ${JSON.stringify(gaps)}`);
});

test('certification data: a source page and a checked date for every entry, and no logos', () => {
  assert.match(CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  for (const [id, c] of Object.entries(CERTS)) {
    assert.ok(c.vendor && c.name, `${id}: vendor and exact name`);
    assert.match(c.url, /^https:\/\/[^\s"<>]+$/, `${id}: an https source URL`);
    assert.equal(c.checked, CHECKED, `${id}: checked on ${CHECKED}`);
    assert.ok(Array.isArray(c.areas) && c.areas.length, `${id}: the official exam areas`);
    assert.ok(!Object.keys(c).some((k) => /logo|image|img|icon|badge/i.test(k)), `${id}: no logo or image fields`);
    assert.doesNotMatch(c.url, /\.(png|jpe?g|svg|webp|gif)$/i, `${id}: the source is a page, not an image`);
  }
});

test('every listed certification overlaps lessons the program really teaches', () => {
  for (const p of PROGRAMS) {
    const codes = new Set(p.terms.flatMap((t) => t.lessons.map(([c]) => c)));
    const list = PROGRAM_CERTS[p.id];
    assert.ok(list?.length, `${p.id} lists at least one certification`);
    for (const m of list) {
      assert.ok(CERTS[m.cert], `${p.id}: ${m.cert} is defined`);
      assert.ok(m.lessons.length, `${p.id}/${m.cert}: overlapping lessons`);
      for (const code of m.lessons) assert.ok(codes.has(code), `${p.id}/${m.cert}: lesson ${code} is in this program`);
      for (const a of m.areas) assert.ok(CERTS[m.cert].areas.includes(a), `${p.id}/${m.cert}: "${a}" is an official exam area`);
    }
    assert.equal(new Set(list.map((m) => m.cert)).size, list.length, `${p.id}: no certification twice`);
  }
});

test('exam areas are called official only when they are the vendor’s own words; summarised ones say so', () => {
  assert.ok(Object.values(CERTS).some((c) => c.summarised), 'at least one entry is summarised today (AWS)');
  for (const p of PROGRAMS) {
    const text = visibleText(pageAt(p.url)).replace(/\s+/g, ' ');
    for (const c of certsFor(p.id)) {
      const label = c.summarised ? 'Exam areas (summarised)' : 'Official exam areas';
      assert.ok(text.includes(decode(`${label}: ${c.overlapAreas.join('; ')}.`)), `${p.id}/${c.id}: "${label}"`);
    }
  }
});

test('the certificates section: sample design, careful wording, the disclaimer and no logos', () => {
  const proof = proofOf(pageAt('/'));
  assert.ok(proof, 'the home page has the certificates section');
  const text = visibleText(proof);
  assert.match(text, /Turn your learning into\s*proof/);
  assert.match(text, /Sample design/);
  assert.match(text, /not an accredited degree/);
  assert.ok(text.includes(CERT_DISCLAIMER), 'the disclaimer');
  assert.match(text, /Topics overlap with/);
  for (const p of PROGRAMS) for (const c of certsFor(p.id)) assert.ok(text.includes(c.name), `${c.name} is listed`);
  assert.doesNotMatch(proof, /<img\b/i, 'no images (and so no company logos) in the section');
  for (const p of PROGRAMS) {
    const html = pageAt(p.url);
    const cred = between(html, '<section class="psec" id="credential"', '</section>');
    const t = visibleText(cred);
    assert.ok(t.includes(CERT_DISCLAIMER), `${p.id}: the disclaimer`);
    assert.match(t, /Sample design/, `${p.id}: the sample certificate is labelled`);
    assert.match(t, /issued by Nuvora when you complete your program/, `${p.id}: no invented issuing criteria`);
    for (const c of certsFor(p.id)) {
      assert.ok(t.includes(c.name), `${p.id}: ${c.name}`);
      assert.ok(cred.includes(`href="${c.url}"`), `${p.id}: links the official page for ${c.name}`);
    }
    assert.doesNotMatch(cred, /<img\b/i, `${p.id}: no logos`);
  }
  for (const { path, html } of site.pages) {
    assert.doesNotMatch(visibleText(html), /prepares? you for (the |an? )?(\w+ )?(exam|certification)|includes? (the |an? )?(\w+ )?(exam|certification) (fee|voucher)/i, `${path}: certification wording`);
  }
});

test('the footer: headed columns, every link resolves to a built page, no app badges, and the credential line', () => {
  const problems = [];
  for (const { path, html } of site.pages) {
    const f = footerOf(html);
    if (!f) { problems.push(`${path}: no footer`); continue; }
    for (const href of hrefs(f)) { const p = linkProblem(href); if (p) problems.push(`${path}: ${p}`); }
    if (/app store|google play|download the app/i.test(f)) problems.push(`${path}: app badges`);
    if (/class="fgrid"|class="fbottom"/.test(f)) problems.push(`${path}: old footer markup`);
    // Column headings are plain headings: a <summary> (or a static button) would be a control that does nothing on
    // wide screens. showcase.js adds the accordion buttons on phones only.
    if (/<summary|<details|<button/.test(f)) problems.push(`${path}: a control in the footer markup`);
  }
  assert.deepEqual([...new Set(problems)], []);
  const f = footerOf(pageAt('/'));
  const text = visibleText(f);
  assert.match(text, /Nuvora certificate of completion · not an accredited degree/);
  assert.deepEqual([...f.matchAll(/<div class="sitefoot-col" data-foot-col>\s*<h2>([^<]+)<\/h2>\s*<ul id="foot-col-\d">/g)].map((m) => m[1]), ['Programs', 'Topics', 'Careers', 'Resources', 'Nuvora', 'Legal']);
  // The credits page credits photos, video clips and fonts, so the link says media, not images.
  assert.match(text, /Media credits/);
  assert.doesNotMatch(text, /Image credits/);
  for (const p of PROGRAMS) assert.ok(hrefs(f).includes(p.url), `the footer links ${p.url}`);
  for (const href of ['/programs/#compare', '/learn/sample-lesson/', '/careers/', '/find-your-program/', '/how-it-works/', '/tuition/', '/admissions/', '/#faq',
    '/about/', '/contact/', '/portal/', '/admissions/#request', '/legal/privacy/', '/legal/terms/', '/legal/credits/', '/legal/accessibility/']) {
    assert.ok(hrefs(f).includes(href), `the footer links ${href}`);
  }
  assert.equal(FOOTER_COLUMNS.length, 6);
});

test('social icons appear only for configured https accounts (none today)', () => {
  assert.ok(Object.values(OWNER.social).every((v) => v === null), 'no social accounts are configured yet');
  assert.doesNotMatch(footerOf(pageAt('/')), /sitefoot-social/, 'so no icons render');
  const some = String(footer({ social: { linkedin: 'https://www.linkedin.com/company/example', x: 'javascript:alert(1)', youtube: 'http://insecure.example' } }));
  assert.match(some, /<a href="https:\/\/www\.linkedin\.com\/company\/example" rel="noopener noreferrer me" aria-label="Nuvora on LinkedIn">/);
  assert.doesNotMatch(some, /javascript:|http:\/\/insecure/);
  assert.deepEqual(socialLinks({}), []);
});

test('nothing banned in the showcase parts: ratings, counts, partners or popularity', () => {
  for (const path of ['/', '/programs/', ...PROGRAMS.map((p) => p.url)]) {
    const html = pageAt(path);
    const parts = [catalogOf(html), proofOf(html), between(html, '<section class="psec" id="credential"', '</section>'), footerOf(html)].join('\n');
    const text = visibleText(parts);
    for (const [name, re] of [
      // "no graduates, reviews or job outcomes yet" is the honest pre-launch line, so a denied mention is allowed.
      ['rating', /★|☆|\brat(ing|ed)\b|\bstars?\b|(?<!\bno\b[^.\n]{0,30})\breviews?\b/i],
      ['learner count', /\b\d[\d,.]*\s*k?\+?\s*(learners|students|enrolled|graduates|alumni)/i],
      ['partner', /\bpartner/i],
      ['popularity', /most popular|bestsell|best-sell|top[- ]rated|trending|#1\b/i],
      ['AI label on rule-based parts', /\bAI[- ]powered|\bAI advisor/i],
    ]) {
      const m = re.exec(text);
      assert.equal(m, null, `${path}: ${name}: "${m && text.slice(Math.max(0, m.index - 40), m.index + 40)}"`);
    }
  }
});

test('the advisor buttons start with the catalog labels', () => {
  const html = pageAt('/');
  assert.match(html, /<span data-advisor-label>Ask Nuvora<\/span><span class="more" data-advisor-more>· catalog answers<\/span>/);
  assert.match(html, /<span data-advisor-mlabel>Ask Nuvora<\/span>/);
});

test('every page loads showcase.css after site.css, and showcase.js', () => {
  for (const { path, html } of site.pages) {
    const a = html.indexOf('href="/css/site.css"'), b = html.indexOf('href="/css/showcase.css"');
    assert.ok(a > 0 && b > a, `${path}: showcase.css after site.css`);
    assert.ok(html.includes('<script type="module" src="/js/showcase.js"></script>'), `${path}: showcase.js`);
  }
});

test('honesty fixes: career ladder wording, the learning system and program pages', () => {
  const home = visibleText(pageAt('/'));
  assert.match(home, /Programs for this role/);
  assert.match(home, /Common tools in this role/);
  assert.doesNotMatch(home, /Tools you will use|Programs that teach these skills/);
  assert.match(home, /Teaches (all \d+ skills listed|\d+ of the \d+ skills listed|related skills)/);
  assert.match(home, /Three graded projects every term, ending in a capstone/);
  assert.match(home, /Mentoring and success coaching are planned; what they include will be published before the first batch\./);
  for (const p of PROGRAMS) {
    const html = pageAt(p.url);
    assert.match(visibleText(html), /See you on their check-in list after 14 days without activity/, `${p.id}: instructor check-ins`);
    p.terms.forEach((_, i) => assert.ok(html.includes(`<details class="term" id="term-${i + 1}"`), `${p.id}: #term-${i + 1}`));
  }
});
