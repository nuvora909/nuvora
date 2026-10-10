// The brochure (/programs/<slug>/brochure/): the program guide as A4 portrait pages, coded as HTML from the same data
// as the guide (web/lib/guide-data.mjs), so every page is real text. Without JavaScript the pages are stacked and
// readable (on narrow screens they reflow). web/assets/js/guide.js turns them into a page-by-page viewer and wires
// the print button; print CSS (css/guide.css) puts one brochure page on each A4 sheet.
//
// The page is noindex: it repeats the guide's content page by page, so search engines should show the guide. It is
// linked from the program cards, the program page and the guide, and stays out of the sitemap.
import { html, accent } from '../lib/html.mjs';
import { icon, wordmark } from '../lib/icons.mjs';
import { page, breadcrumbs, liveDate } from '../lib/layout.mjs';
import { breadcrumbList } from '../lib/schema.mjs';
import { stormSky, kicker, goldName, weekStripHtml } from '../lib/guide-ui.mjs';
import { OWNER } from '../data/site.mjs';
import { nextStarts, termDates, fmtDay, isoDay } from '../data/programs.mjs';
import {
  PROGRAMS, CREDENTIAL, CREDENTIAL_LINE, CAREER_NOTE, CERT_DISCLAIMER, CERTS_INTRO, CHECKED_ON, RUBRIC_RULE, SCHEDULE, LIVE,
  guideUrl, brochureUrl, requestUrl, heroImage, motifImage, plural, listAnd, levelKicker,
  termsOf, projectWeeks, systemFor, rubricRows, rolesOf, certsOf, tuitionOf, JOIN_STEPS,
} from '../lib/guide-data.mjs';

export const TERMS_PER_PAGE = 4;
const pad = (n) => String(n).padStart(2, '0');
const DESC_MAX = 170;
const fit = (max, candidates) => candidates.find((s) => s.length <= max) ?? candidates[candidates.length - 1];
const crumbsFor = (p) => [['/', 'Home'], ['/programs/', 'Programs'], [p.url, p.name], [brochureUrl(p), 'Brochure']];
const LATER = 'to be published before the first batch';

// ---------------------------------------------------------------- page furniture
// The wordmark's "o" is a drawn ring, so each wordmark is named "Nuvora" for screen readers; the running header
// repeats on every page, so its wordmark is hidden from them and the header reads "Program guide · <program>".
const mark = () => html`<span role="img" aria-label="Nuvora">${wordmark({ light: true })}</span>`;
const runHead = (p) => html`<div class="gb-run"><span class="gb-wm" aria-hidden="true">${wordmark({ light: true })}</span><span class="gb-run-t">Program guide · ${p.name}</span></div>`;
const pageHead = ({ k, id, title, lede }) => html`
<div class="gb-head">
  ${kicker(k)}
  <h2 id="${id}">${accent(title)}</h2>
  ${lede && html`<p class="gb-lede">${lede}</p>`}
</div>`;

// ---------------------------------------------------------------- the pages
function front(p, { today }) {
  const img = heroImage(p);
  return { title: 'Cover', cls: 'gb-front', body: html`
<div class="gb-front-top"><span class="gb-wm big">${mark()}</span><p class="gb-front-k">Program guide<b>Online · 12-week terms</b></p></div>
<div class="gb-front-art"><img src="${img.src}" alt="${img.alt}" width="${img.width}" height="${img.height}" fetchpriority="high" decoding="async"><span class="st-tag">3D illustration</span></div>
<div class="gb-front-copy">
  <p class="gb-pill">${levelKicker(p)}</p>
  <h2 class="gb-front-title" id="gb-p1">${goldName(p)}</h2>
  <p class="gb-front-tag">${p.tagline}</p>
</div>
<dl class="gb-front-facts" data-test="brochure-facts">
  <div><dt>Duration</dt><dd data-fact="duration">${p.duration}</dd></div>
  <div><dt>Weekly time</dt><dd data-fact="weekly">${p.weeklyHours} hours</dd></div>
  <div><dt>Learning</dt><dd><span data-fact="terms">${plural(p.termCount, 'term')}</span> · <span data-fact="projects">${p.projects} graded projects</span></dd></div>
  <div><dt>Next start</dt><dd data-fact="next-start">${liveDate('start', 0, today)}</dd></div>
</dl>
<p class="gb-front-line">Online · recorded lessons plus two live Jitsi sessions a week · <span data-test="credential-line">${CREDENTIAL_LINE}</span></p>` };
}

function fitPage(p, { today }) {
  const t = tuitionOf(p);
  const tiles = [
    ['clock', 'Duration', p.duration], ['cal', 'Weekly time', `${p.weeklyHours} hours`],
    ['layers', 'Structure', p.termCount === 1 ? 'One 12-week term' : `${p.termCount} × 12-week terms`],
    ['folder', 'Lessons and projects', `${p.lessons} lessons, ${p.projects} graded projects`],
    ['video', 'Live sessions', `${SCHEDULE.classDay.slice(0, 3)} class + ${SCHEDULE.officeDay.slice(0, 3)} office hours`],
    ['cert', 'Nuvora credits', `${p.credits} (workload, not academic credit)`],
    ['coin', 'Tuition', html`<span data-fact="tuition-per-term">${t.perTerm}</span> per term`],
  ];
  return { title: 'Is it right for you?', body: html`
${pageHead({ k: 'At a glance', id: 'gb-fit', title: 'Is it *right* for you?', lede: `Who the ${p.name} is for, what you need before you start, and the tools you will use.` })}
<ul class="gb-tiles">${tiles.map(([ic, k, v]) => html`<li>${icon(ic)}<span class="st-k">${k}</span><b>${v}</b></li>`)}
  <li>${icon('pulse')}<span class="st-k">Next start</span><b>${liveDate('start', 0, today)}</b><span class="gb-sub">apply by ${liveDate('applyBy', 0, today)}</span></li>
</ul>
<div class="gb-cols3">
  <div class="gb-col st-top-blue"><h3>${icon('users')}Who it’s for</h3><ul class="st-ticks">${p.audience.map((a) => html`<li>${icon('check')}<span>${a}</span></li>`)}</ul></div>
  <div class="gb-col st-top-gold"><h3>${icon('book')}What you need</h3><ul class="st-ticks">${p.required.map((r) => html`<li>${icon('check')}<span>${r}</span></li>`)}</ul>
    <p class="gb-small"><b>Helpful:</b> ${p.helpful.join(', ')}</p>
    <p class="gb-note">${p.needsBachelor ? 'Joining needs a bachelor’s degree in any field.' : 'No degree needed to join.'}</p></div>
  <div class="gb-col st-top-cyan"><h3>${icon('spark')}Tools you will use</h3><ul class="st-chips">${p.tools.map((x) => html`<li>${x}</li>`)}</ul></div>
</div>
<div class="st-strip-note gb-batch"><p><span class="st-k">Next batch starts</span><b>${liveDate('start', 0, today)}</b></p><p>Seat requests close ${liveDate('applyBy', 0, today)}. Batches start on the first Monday of every month.</p></div>` };
}

function outcomesPage(p) {
  const terms = termsOf(p);
  const motif = motifImage(p);
  const cols = terms.length >= 9 ? 3 : terms.length > 1 ? 2 : 1;
  return { title: 'What you’ll be able to do', body: html`
<div class="gb-split">
  ${pageHead({ k: 'Learning outcomes', id: 'gb-out', title: 'What you’ll be able to *do*', lede: 'Each term ends with a skill badge, earned by completing every lesson and passing all three projects.' })}
  <div class="gb-motif" aria-hidden="true"><img src="${motif.src}" alt="" width="${motif.width}" height="${motif.height}" loading="lazy" decoding="async"></div>
</div>
<ol class="gb-badges c${cols}">${terms.map((t) => html`
  <li><span class="st-num">${pad(t.n)}</span><div><h3>${t.badge}</h3>${cols === 1
    ? html`<ul>${t.lessons.map(([code, title]) => html`<li><span class="st-code">${code}</span> ${title}</li>`)}</ul>`
    : html`<p>${t.lessons.map(([, title]) => title).join(' · ')}</p>`}</div></li>`)}
</ol>
<div class="st-callout"><p class="st-k">The capstone</p><p class="st-callout-t">${p.capstone}</p></div>` };
}

function systemPage(p) {
  return { title: 'The Nuvora learning system', body: html`
${pageHead({ k: 'How you learn', id: 'gb-sys', title: 'The Nuvora *learning* system', lede: 'Three ideas shape every program: learning that fits your life, mastery you prove with real work, and people who keep you moving.' })}
<div class="gb-pillars">${systemFor(p).map((s, i) => html`
  <div class="gb-pillar"><span class="st-num sm">${pad(i + 1)}</span><h3>${accent(s.title)}</h3><p>${s.text}</p><ul class="st-ticks">${s.points.map((x) => html`<li>${icon('check')}<span>${x}</span></li>`)}</ul></div>`)}
</div>
${weekStripHtml(p)}
<p class="gb-small">${LIVE.sentence} Plan for about ${p.weeklyHours} hours a week in total, including lessons and project work.</p>` };
}

function pathPages(p) {
  const terms = termsOf(p);
  const out = [];
  for (let i = 0; i < terms.length; i += TERMS_PER_PAGE) {
    const chunk = terms.slice(i, i + TERMS_PER_PAGE);
    const range = chunk.length === 1 ? `Term ${chunk[0].n} of ${terms.length}` : `Terms ${chunk[0].n}–${chunk.at(-1).n} of ${terms.length}`;
    const first = i === 0;
    out.push({ title: `Your learning path, ${range.toLowerCase().replace('–', ' to ')}`, cls: chunk.length === 1 ? 'gb-path one' : 'gb-path', body: html`
${pageHead({ k: `Your learning path · ${range}`, id: `gb-path-${chunk[0].n}`,
  title: first ? (terms.length === 1 ? 'One term, *12 weeks*' : `${terms.length} terms, *one after another*`) : `Your learning path, *continued*`,
  lede: first ? (terms.length === 1
    ? `One 12-week term with ${plural(p.terms[0].lessons.length, 'competency lesson')} and ${plural(p.terms[0].projects.length, 'graded project')}, due in weeks ${listAnd(projectWeeks(p))}.`
    : `${plural(terms.length, 'term')} of 12 weeks. Each term has ${p.terms[0].lessons.length} competency lessons and ${p.terms[0].projects.length} graded projects due in weeks ${listAnd(projectWeeks(p))}.`) : null })}
<ol class="st-terms gb-terms" start="${chunk[0].n}">${chunk.map((t) => html`
  <li class="st-term" data-term="${t.n}">
    <span class="st-term-n ${t.n === terms.length ? 'last' : ''}"><span class="st-k">Term</span><b>${pad(t.n)}</b></span>
    <div class="st-term-main">
      <h3>${t.title}</h3>
      <p class="st-badge">${icon('cert')}Skill badge: ${t.badge}</p>
      <h4 class="sr-only">Lessons in term ${t.n}</h4>
      <ul class="st-lessons">${t.lessons.map(([code, title]) => html`<li data-lesson="${code}"><span class="st-code">${code}</span><span>${title}</span></li>`)}</ul>
    </div>
    <div class="st-term-pj">
      <h4>Graded projects<span class="sr-only"> in term ${t.n}</span></h4>
      <ul>${t.projects.map((pj) => html`<li data-project-week="${pj.week}"><span class="st-wk">Wk ${pj.week}</span><span>${pj.title}</span></li>`)}</ul>
    </div>
  </li>`)}
</ol>` });
  }
  return out;
}

function projectsPage(p) {
  const terms = termsOf(p);
  const list = terms.length === 1
    ? { title: 'Your three graded projects', items: terms[0].projects.map((pj) => [`Wk ${pj.week}`, pj.title]) }
    : { title: 'The project that closes each term', items: terms.map((t) => [pad(t.n), t.projects.at(-1).title]) };
  return { title: 'Projects and assessment', body: html`
${pageHead({ k: 'Projects and assessment', id: 'gb-pj', title: 'You learn by *building*', lede: `Every one of your ${p.projects} projects is graded by an instructor, and your work stays in your portfolio.` })}
<div class="st-capstone">
  <div><p class="st-k gold">Capstone</p><p class="st-capstone-t">${p.capstone}</p></div>
  <dl>
    <div><dt>${p.projects}</dt><dd>graded projects</dd></div>
    <div><dt>${p.terms[0].projects.length}</dt><dd>per term, due in weeks ${listAnd(projectWeeks(p))}</dd></div>
    <div><dt>${icon('check')}<span class="sr-only">Every project</span></dt><dd>graded by an instructor, with written feedback</dd></div>
  </dl>
</div>
<h3 class="gb-h3">${list.title}</h3>
<ol class="gb-pjlist ${list.items.length > 6 ? 'c3' : list.items.length > 3 ? 'c2' : 'c1'}">${list.items.map(([n, t]) => html`<li><span class="st-num xs">${n}</span><span>${t}</span></li>`)}</ol>
<h3 class="gb-h3">How your work is assessed</h3>
<div class="st-rubric">${rubricRows().map(([name, text, result], i) => html`<div class="st-card r${i + 1}"><h4>${name}</h4><p class="st-k">${result}</p><p>${text}</p></div>`)}</div>
<p class="gb-small">${RUBRIC_RULE} A lesson counts as complete when you have watched 90% of it.</p>` };
}

function careersPage(p) {
  return { title: 'Roles and certifications', body: html`
${pageHead({ k: 'Careers and credentials', id: 'gb-roles', title: 'Roles this curriculum is *designed for*' })}
<ul class="gb-roles">${rolesOf(p).map((r) => html`<li><a href="${r.url}"><b>${r.title}</b><span>${r.summary}</span>
  ${r.taught.length ? html`<p class="gb-taught">This program teaches</p><ul>${r.taught.slice(0, 4).map(([skill, code]) => html`<li><span class="st-code">${code}</span>${skill}</li>`)}</ul>` : ''}</a></li>`)}</ul>
<p class="gb-small">${CAREER_NOTE}</p>
<h3 class="gb-h3">Industry certifications to aim for <span class="serif">next</span></h3>
<p class="gb-small">${CERTS_INTRO} Checked on each company’s official page on ${CHECKED_ON}.</p>
<ul class="gb-certs">${certsOf(p).map((c) => html`<li><div><b>${c.name}</b>${c.status && html`<span class="st-status" data-cert-status>${c.status}</span>`}</div><span>${c.vendor}${c.exam ? ` · exam ${c.exam}` : ''}</span></li>`)}</ul>
<p class="gb-small">${CERT_DISCLAIMER}</p>
<div class="gb-yours">
  <p class="st-k gold">${icon('cert')}Your credential</p>
  <h3>${CREDENTIAL.short}</h3>
  <p>Issued by Nuvora for the ${p.name} when you complete your program. ${CREDENTIAL.note}</p>
</div>` };
}

function tuitionPage(p) {
  const t = tuitionOf(p);
  return { title: 'Tuition and joining', body: html`
${pageHead({ k: 'Tuition and joining', id: 'gb-fee', title: 'Simple pricing, *one term* at a time', lede: t.note })}
<div class="gb-price">
  <div class="st-pricecard">
    <p class="st-k">Tuition per 12-week term</p>
    <p class="st-price" data-fact="tuition-per-term">${t.perTerm}</p>
    <dl>
      <div><dt>Number of terms</dt><dd data-fact="term-count">${t.terms}</dd></div>
      <div><dt>Total tuition</dt><dd data-fact="tuition-total">${t.total}</dd></div>
      <div><dt>Application fee</dt><dd data-fact="application-fee">${t.fee}, once</dd></div>
    </dl>
  </div>
  <div class="gb-price-side">
    <div class="gb-col"><h3>Financing</h3><p>${t.financing}</p></div>
    <div class="gb-col"><h3>Refunds and deferrals</h3><p>${t.refunds}</p></div>
  </div>
</div>
<h3 class="gb-h3">Four steps to your <span class="serif">first term</span></h3>
<ol class="gb-steps">${JOIN_STEPS(p).map((s, i) => html`<li class="${i === 3 ? 'last' : ''}"><span class="st-step" aria-hidden="true">${i + 1}</span><div><h4><span class="sr-only">Step ${i + 1}: </span>${s.title}</h4><p>${s.text}</p></div></li>`)}</ol>
<p class="gb-small">You only pay at the last step, once enrolment opens. Until then, nothing is charged.</p>` };
}

// The dates of every term for the next start, in the markup site.js refreshes in the browser (table[data-termpath]).
function termTable(p, today) {
  const start = nextStarts(1, today)[0].start;
  return html`
<h3 class="gb-h3">Your term dates</h3>
<table class="gb-starts" data-termpath="${p.termCount}"><caption>If you start on ${fmtDay(start)}</caption>
  <thead><tr><th scope="col">Term</th><th scope="col">Starts</th><th scope="col">Ends</th></tr></thead>
  <tbody>${termDates(start, p.termCount).map((r) => html`<tr data-term="${r.term}"><th scope="row"><span class="st-num xs">${pad(r.term)}</span> ${p.terms[r.term - 1].title}</th><td><time datetime="${isoDay(r.start)}">${fmtDay(r.start)}</time></td><td><time datetime="${isoDay(r.end)}">${fmtDay(r.end)}</time></td></tr>`)}</tbody>
</table>`;
}

function backPage(p, { today }) {
  const motif = motifImage(p);
  return { title: 'Request a seat', cls: 'gb-back', body: html`
<div class="gb-back-art" aria-hidden="true"><img src="${motif.src}" alt="" width="${motif.width}" height="${motif.height}" loading="lazy" decoding="async"></div>
${pageHead({ k: 'Your next step', id: 'gb-back', title: 'Request your *seat*', lede: `Choose the ${p.name} and a start date. It is free to request, and Nuvora replies by email with next steps.` })}
<div class="st-go">
  <div><p class="st-k">Next start</p><p class="st-go-date">${liveDate('start', 0, today)}</p><p>Seat requests close ${liveDate('applyBy', 0, today)}</p></div>
  <div class="gb-go-links">
    <p class="st-k">On the Nuvora website</p>
    <a href="${requestUrl(p)}">Request a seat on the Admissions page</a>
    <a href="${guideUrl(p)}">The ${p.short} program guide</a>
  </div>
</div>
${termTable(p, today)}
<p class="gb-small">Batches start on the first Monday of every month. Support contact: ${OWNER.supportEmail ?? LATER}.</p>
<p class="gb-fine">Pre-launch: Nuvora has no graduates, reviews or job outcomes yet, and does not guarantee jobs, promotions or salaries. Nuvora awards a certificate of completion, not an accredited degree; Nuvora credits describe workload and may not transfer to universities. Prices are launch pricing in US dollars. The illustrations are original artwork made for Nuvora.</p>
<p class="gb-back-mark">${mark()}</p>` };
}

/** Every page of one program's brochure, in order: [{ title, cls, body }]. */
export function brochurePages(p, opts = {}) {
  return [front(p, opts), fitPage(p, opts), outcomesPage(p), systemPage(p), ...pathPages(p), projectsPage(p), careersPage(p), tuitionPage(p), backPage(p, opts)];
}

const article = (p, pg, i, total) => html`
<article class="gb-page ${pg.cls ?? ''}" id="page-${i + 1}" aria-label="Page ${i + 1} of ${total}" data-gb-title="${pg.title}">
  <div class="gb-in">
    ${i ? runHead(p) : ''}
    <div class="gb-body">${pg.body}</div>
    <div class="gb-foot"><span>${CREDENTIAL_LINE}</span><span class="gb-pn" aria-hidden="true">${pad(i + 1)}</span></div>
  </div>
</article>`;

function body(p, { today }) {
  const pages = brochurePages(p, { today });
  return html`
<div class="storm gb-desk on-dark" data-gb-root>
  <div class="wrap gb-top st-stage">
    ${stormSky()}
    ${breadcrumbs(crumbsFor(p))}
    <div class="gb-intro">
      <div>
        ${kicker(`Brochure · ${plural(pages.length, 'page')}`)}
        <h1>${p.name} <span class="serif">brochure</span></h1>
        <p class="gb-intro-lede">The program guide as a printable brochure, made from the same facts as the program page. Turn the pages, print it, or read it all at once.</p>
      </div>
      <div class="gb-tools">
        <a class="btn ghost" href="${guideUrl(p)}">${icon('route')}Program guide</a>
        <button class="btn ghost" type="button" data-gb-print hidden>${icon('doc')}Print this brochure</button>
      </div>
    </div>
  </div>
  <div class="gb-viewer" data-gb-viewer tabindex="-1">
    <div class="gb-bar" data-gb-controls hidden>
      <button class="btn ghost gb-turn" type="button" data-gb-prev aria-controls="gb-book">${icon('chev', 'ic flip')}<span>Previous<span class="sr-only"> page</span></span></button>
      <p class="gb-count" data-gb-count>Page 1 of ${pages.length}</p>
      <button class="btn ghost gb-turn" type="button" data-gb-next aria-controls="gb-book"><span>Next<span class="sr-only"> page</span></span>${icon('chev')}</button>
      <button class="btn ghost gb-all" type="button" data-gb-all aria-pressed="false" aria-controls="gb-book">${icon('layers')}Show all pages</button>
    </div>
    <p class="sr-only" aria-live="polite" aria-atomic="true" data-gb-live></p>
    <div class="gb-book" id="gb-book" data-gb-book>
      ${pages.map((pg, i) => article(p, pg, i, pages.length))}
    </div>
    <div class="gb-end" data-gb-end hidden>
      <button class="btn ghost" type="button" data-gb-end-prev aria-controls="gb-book">${icon('chev', 'ic flip')}Back to page <span data-n>1</span></button>
      <button class="btn ghost" type="button" data-gb-end-next aria-controls="gb-book">Turn to page <span data-n>2</span>${icon('chev')}</button>
    </div>
  </div>
</div>`;
}

/**
 * @param o.today      the build date (tests pass one)
 */
export default function brochures({ today } = {}) {
  return PROGRAMS.map((p) => {
    const url = brochureUrl(p);
    const n = brochurePages(p, { today }).length;
    return {
      path: url,
      noindex: true,
      html: page({
        path: url, today, noindex: true,
        title: `${p.name} brochure`,
        description: fit(DESC_MAX, [
          `The ${p.name} brochure in ${n} printable pages: terms, lessons, projects, the weekly rhythm, tuition per term and the four steps to join.`,
          `The ${p.short} brochure in ${n} printable pages: terms, lessons, projects, the weekly rhythm, tuition and how to join.`,
        ]),
        body: body(p, { today }),
        schema: [breadcrumbList(crumbsFor(p))],
        styles: ['/css/guide.css'],
        scripts: ['/js/guide.js'],
        image: heroImage(p).src,
      }),
    };
  });
}

