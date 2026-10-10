// The program guide (/programs/<slug>/guide/): one long, dark "storm" page per program that walks through the program
// in the order a visitor decides: who it is for, what you will be able to do, how learning works week by week, every
// term, lesson and project, how work is assessed, the 3D guide, roles, certifications and the credential, tuition,
// questions and the four steps to a first term. Every fact comes from the data modules (web/lib/guide-data.mjs).
// The stage stays dark in both colour schemes; the site header and footer follow the theme. Styles: css/guide.css.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, breadcrumbs, liveDate } from '../lib/layout.mjs';
import { breadcrumbList } from '../lib/schema.mjs';
import { brochureCoverUrl, coverGlow } from '../lib/covers.mjs';
import { stormSky, kicker, goldName, head, weekStripHtml } from '../lib/guide-ui.mjs';
import {
  PROGRAMS, CREDENTIAL, CREDENTIAL_LINE, CAREER_NOTE, CERT_DISCLAIMER, CERTS_INTRO, CHECKED_ON, RUBRIC_RULE, LIVE,
  guideUrl, brochureUrl, requestUrl, heroImage, motifImage, plural, listAnd, levelKicker,
  termsOf, projectWeeks, systemFor, rubricRows, rolesOf, certsOf, tuitionOf, JOIN_STEPS, guideFaq, pathLede,
} from '../lib/guide-data.mjs';

const TITLE_MAX = 61, DESC_MAX = 170;   // the title gets " | Nuvora" added (tests/site/build.test.mjs)
const fit = (max, candidates) => candidates.find((s) => s.length <= max) ?? candidates[candidates.length - 1];

const crumbsFor = (p) => [['/', 'Home'], ['/programs/', 'Programs'], [p.url, p.name], [guideUrl(p), 'Program guide']];

const picker = (current) => html`
<nav class="gd-picker" aria-label="Program guides">
  <p class="gd-picker-k" aria-hidden="true">Program guides</p>
  <ul data-hscroll>${PROGRAMS.map((p) => html`<li><a href="${guideUrl(p)}" ${p.id === current.id ? html`aria-current="page"` : ''}>${p.short}</a></li>`)}</ul>
</nav>`;

const previewButton = (p, label = '3D preview') => html`<button class="btn ghost" type="button" data-preview3d-trigger data-program-id="${p.id}" aria-haspopup="dialog" aria-label="3D preview of the ${p.name} program guide" hidden>${icon('layers')}${label}</button>`;

function hero(p, { today }) {
  const img = heroImage(p);
  return html`
<div class="gd-hero wrap">
  <div class="gd-hero-copy">
    ${kicker(`Program guide · ${levelKicker(p)}`)}
    <h1 class="gd-title">${goldName(p)}</h1>
    <p class="gd-tagline">${p.tagline}</p>
    <dl class="gd-glance" data-test="guide-glance">
      <div><dt>${icon('clock')}Duration</dt><dd data-fact="duration">${p.duration}</dd></div>
      <div><dt>${icon('cal')}Weekly time</dt><dd data-fact="weekly">${p.weeklyHours} hours</dd></div>
      <div><dt>${icon('layers')}Terms and projects</dt><dd><span data-fact="terms">${plural(p.termCount, 'term')}</span> · <span data-fact="projects">${p.projects} graded projects</span></dd></div>
      <div><dt>${icon('pulse')}Next start</dt><dd data-fact="next-start">${liveDate('start', 0, today)}</dd></div>
    </dl>
    <div class="gd-ctas">
      <a class="btn gold" href="${requestUrl(p)}" data-cta="guide-request">Request a seat ${icon('arrow')}</a>
      <a class="btn ghost" href="${brochureUrl(p)}" data-cta="guide-brochure">${icon('book')}Read the brochure</a>
      ${previewButton(p)}
    </div>
    <p class="gd-cred">${icon('cert')}<span>${CREDENTIAL_LINE}</span></p>
  </div>
  <div class="gd-hero-art">
    <img src="${img.src}" alt="${img.alt}" width="${img.width}" height="${img.height}" fetchpriority="high" decoding="async">
    <span class="st-tag">3D illustration</span>
  </div>
</div>`;
}

const fit4 = (p, today) => html`
<section class="gd-sec" id="fit" aria-labelledby="fit-title">
  <div class="wrap">
    ${head({ id: 'fit-title', k: 'At a glance', title: 'Is it *right* for you?', lede: `Who the ${p.name} is designed for, what you need before you start, and the tools you will use.` })}
    <div class="gd-fit">
      <div class="st-card st-top-blue"><h3>${icon('users')}Who it’s for</h3><ul class="st-ticks">${p.audience.map((a) => html`<li>${icon('check')}<span>${a}</span></li>`)}</ul></div>
      <div class="st-card st-top-gold"><h3>${icon('book')}What you need</h3><ul class="st-ticks">${p.required.map((r) => html`<li>${icon('check')}<span>${r}</span></li>`)}</ul>
        <p class="st-small"><b>Helpful:</b> ${p.helpful.join(', ')}</p>
        <p class="st-note">${p.needsBachelor ? 'Joining needs a bachelor’s degree in any field.' : 'No degree needed to join.'}</p></div>
      <div class="st-card st-top-cyan"><h3>${icon('spark')}Tools you will use</h3><ul class="st-chips">${p.tools.map((t) => html`<li>${t}</li>`)}</ul></div>
    </div>
    <div class="st-strip-note"><p><span class="st-k">Next batch starts</span><b>${liveDate('start', 0, today)}</b></p><p>Seat requests close ${liveDate('applyBy', 0, today)}. Batches start on the first Monday of every month.</p></div>
  </div>
</section>`;

const outcomes = (p) => {
  const motif = motifImage(p);
  return html`
<section class="gd-sec" id="outcomes" aria-labelledby="outcomes-title">
  <div class="wrap">
    <div class="gd-split">
      ${head({ id: 'outcomes-title', k: 'Learning outcomes', title: 'What you’ll be able to *do*',
        lede: `Each term ends with a skill badge in the student portal, earned by completing every lesson and passing all three projects (Proficient or better). Here is what each one covers in the ${p.name}.` })}
      <div class="gd-motif" aria-hidden="true"><img src="${motif.src}" alt="" width="${motif.width}" height="${motif.height}" loading="lazy" decoding="async"></div>
    </div>
    <ol class="gd-badges">${termsOf(p).map((t) => html`
      <li class="st-card"><span class="st-num">${String(t.n).padStart(2, '0')}</span><div><h3>${t.badge}</h3><p>${t.lessons.map(([, title]) => title).join(' · ')}</p></div></li>`)}
    </ol>
    <div class="st-callout"><p class="st-k">The capstone</p><p class="st-callout-t">${p.capstone}</p></div>
  </div>
</section>`;
};

const system = (p) => html`
<section class="gd-sec" id="system" aria-labelledby="system-title">
  <div class="wrap">
    ${head({ id: 'system-title', k: 'How you learn', title: 'The Nuvora *learning* system',
      lede: 'Three ideas shape every program: learning that fits your life, mastery you prove with real work, and people who keep you moving.' })}
    <div class="gd-pillars">${systemFor(p).map((s, i) => html`
      <div class="st-card"><span class="st-num sm">${String(i + 1).padStart(2, '0')}</span><h3>${accent(s.title)}</h3><p>${s.text}</p>
        <ul class="st-ticks">${s.points.map((x) => html`<li>${icon('check')}<span>${x}</span></li>`)}</ul></div>`)}
    </div>
    ${weekStripHtml(p)}
    <p class="st-small gd-after-strip">${LIVE.sentence} Plan for about ${p.weeklyHours} hours a week in total, including lessons and project work in your own time.</p>
  </div>
</section>`;

const termCard = (t, total) => html`
<li class="st-term" data-term="${t.n}" id="term-${t.n}">
  <span class="st-term-n ${t.n === total ? 'last' : ''}"><span class="st-k">Term</span><b>${String(t.n).padStart(2, '0')}</b></span>
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
</li>`;

const path = (p) => html`
<section class="gd-sec" id="path" aria-labelledby="path-title">
  <div class="wrap">
    ${head({ id: 'path-title', k: 'Your learning path', title: p.termCount === 1 ? 'One term, *12 weeks*' : `${p.termCount} terms, *one after another*`,
      lede: pathLede(p) })}
    <ol class="st-terms" data-test="term-path">${termsOf(p).map((t) => termCard(t, p.termCount))}</ol>
  </div>
</section>`;

// Multi-term programs list the project that closes each term; a one-term certificate lists its three projects.
const projectList = (p) => {
  const terms = termsOf(p);
  if (terms.length === 1) return { title: 'Your three graded projects', items: terms[0].projects.map((pj) => [`Wk ${pj.week}`, pj.title]) };
  return { title: 'The project that closes each term', items: terms.map((t) => [String(t.n).padStart(2, '0'), t.projects.at(-1).title]) };
};

const projects = (p) => {
  const list = projectList(p);
  return html`
<section class="gd-sec" id="projects" aria-labelledby="projects-title">
  <div class="wrap">
    ${head({ id: 'projects-title', k: 'Projects and assessment', title: 'You learn by *building*',
      lede: `Every one of your ${p.projects} projects is graded by an instructor, and your work stays in your portfolio.` })}
    <div class="st-capstone">
      <div><p class="st-k gold">Capstone</p><p class="st-capstone-t">${p.capstone}</p></div>
      <dl>
        <div><dt>${p.projects}</dt><dd>graded projects</dd></div>
        <div><dt>${p.terms[0].projects.length}</dt><dd>per term, due in weeks ${listAnd(projectWeeks(p))}</dd></div>
        <div><dt>${icon('check')}<span class="sr-only">Every project</span></dt><dd>graded by an instructor, with written feedback</dd></div>
      </dl>
    </div>
    <h3 class="gd-h3">${list.title}</h3>
    <ol class="gd-pjlist">${list.items.map(([n, t]) => html`<li><span class="st-num xs">${n}</span><span>${t}</span></li>`)}</ol>
    <h3 class="gd-h3">How your work is assessed</h3>
    <div class="st-rubric">${rubricRows().map(([name, text, result], i) => html`
      <div class="st-card r${i + 1}"><h4>${name}</h4><p class="st-k">${result}</p><p>${text}</p></div>`)}
    </div>
    <p class="st-small">${RUBRIC_RULE} A lesson counts as complete when you have watched 90% of it.</p>
  </div>
</section>`;
};

const guide3d = (p) => html`
<section class="gd-sec" id="guide-3d" aria-labelledby="g3d-title">
  <div class="wrap gd-3d">
    <div class="gd-3d-stage" style="--g3d-glow:${coverGlow(p)}">
      <div class="gd-book" aria-hidden="true">
        <span class="gd-book-pages"></span><span class="gd-book-back"></span>
        <img class="gd-book-face" src="${brochureCoverUrl(p)}" alt="" width="480" height="640" loading="lazy" decoding="async">
        <span class="gd-book-foil"></span>
      </div>
      <span class="gd-3d-ring" aria-hidden="true"></span>
    </div>
    <div>
      ${head({ id: 'g3d-title', k: 'Your program guide in 3D', title: 'Turn the guide in *3D*',
        lede: `A 3D model of the program guide’s design for the ${p.name}, with its facts on the back cover. Open the 3D preview, then drag it or use the arrow keys or the buttons to turn it.` })}
      <div class="gd-ctas">
        ${previewButton(p, 'Open the 3D preview')}
        <a class="btn ghost" href="${brochureUrl(p)}">${icon('book')}Read it page by page</a>
      </div>
    </div>
  </div>
</section>`;

const roles = (p) => html`
<section class="gd-sec" id="roles" aria-labelledby="roles-title">
  <div class="wrap">
    ${head({ id: 'roles-title', k: 'Careers', title: 'Roles this curriculum is *designed for*',
      lede: 'Open a role to see the skills it needs and where this program teaches them.' })}
    <ul class="gd-roles">${rolesOf(p).map((r) => html`
      <li><a class="st-card st-role" href="${r.url}"><b>${r.title}</b><span>${r.summary}</span><span class="st-more">Skills for this role ${icon('arrow')}</span></a></li>`)}
    </ul>
    <p class="st-small">${CAREER_NOTE}</p>
  </div>
</section>`;

const credentials = (p) => html`
<section class="gd-sec" id="credentials" aria-labelledby="certs-title">
  <div class="wrap gd-creds">
    <div>
      ${head({ id: 'certs-title', k: 'Credentials', title: 'Industry certifications to aim for *next*',
        lede: `${CERTS_INTRO} Text only: these are their names, not endorsements.` })}
      <ul class="gd-certs">${certsOf(p).map((c) => html`<li class="st-card"><b>${c.name}</b><span>${c.vendor}${c.exam ? ` · exam ${c.exam}` : ''}</span>${c.status && html`<span class="st-status" data-cert-status>${icon('info')}${c.status}</span>`}</li>`)}</ul>
      <p class="st-small">Checked on each company’s official page on ${CHECKED_ON}. ${CERT_DISCLAIMER} <a href="${p.url}#credential">Overlapping lessons and official pages</a></p>
    </div>
    <div class="st-card gd-yours">
      <p class="st-k gold">${icon('cert')}Your credential</p>
      <h3>${CREDENTIAL.short}</h3>
      <p>Issued by Nuvora for the ${p.name} when you complete your program. ${CREDENTIAL.note}</p>
      <p class="st-small">The ${p.credits} Nuvora credits${p.termCount > 1 ? ` (about ${p.creditsPerTerm} per term)` : ''} describe workload; they are not academic credit.</p>
      <p class="gd-credline" data-test="credential-line">${CREDENTIAL_LINE}</p>
    </div>
  </div>
</section>`;

const tuition = (p) => {
  const t = tuitionOf(p);
  return html`
<section class="gd-sec" id="tuition" aria-labelledby="tuition-title">
  <div class="wrap">
    ${head({ id: 'tuition-title', k: 'Tuition', title: 'Simple pricing, *one term* at a time', lede: t.note })}
    <div class="gd-price">
      <div class="st-card st-pricecard">
        <p class="st-k">Tuition per 12-week term</p>
        <p class="st-price" data-fact="tuition-per-term">${t.perTerm}</p>
        <dl>
          <div><dt>Number of terms</dt><dd data-fact="term-count">${t.terms}</dd></div>
          <div><dt>Total tuition</dt><dd data-fact="tuition-total">${t.total}</dd></div>
          <div><dt>Application fee</dt><dd data-fact="application-fee">${t.fee}, once</dd></div>
        </dl>
      </div>
      <div class="gd-price-side">
        <div class="st-card"><h3>Financing</h3><p>${t.financing}</p></div>
        <div class="st-card"><h3>Refunds and deferrals</h3><p>${t.refunds}</p><a class="st-more" href="/tuition/#refunds">Tuition and refunds ${icon('arrow')}</a></div>
      </div>
    </div>
  </div>
</section>`;
};

const faq = (p) => html`
<section class="gd-sec" id="faq" aria-labelledby="faq-title">
  <div class="wrap gd-narrow">
    ${head({ id: 'faq-title', k: 'Questions', title: 'Questions about this *program*' })}
    <div class="gd-faq">${guideFaq(p).map(([q, a]) => html`<details><summary>${q}${icon('down')}</summary><p>${a}</p></details>`)}</div>
  </div>
</section>`;

const steps = (p, today) => html`
<section class="gd-sec" id="join" aria-labelledby="join-title">
  <div class="wrap">
    ${head({ id: 'join-title', k: 'How joining works', title: 'Four steps to your *first term*', lede: 'You only pay at the last step, once enrolment opens. Until then, nothing is charged.' })}
    <ol class="gd-steps">${JOIN_STEPS(p).map((s, i) => html`
      <li class="st-card ${i === 3 ? 'last' : ''}"><span class="st-step" aria-hidden="true">${i + 1}</span><div><h3><span class="sr-only">Step ${i + 1}: </span>${s.title}</h3><p>${s.text}</p></div></li>`)}
    </ol>
    <div class="st-go">
      <div><p class="st-k">Next start</p><p class="st-go-date">${liveDate('start', 0, today)}</p><p>Seat requests close ${liveDate('applyBy', 0, today)}</p></div>
      <div class="gd-ctas">
        <a class="btn gold" href="${requestUrl(p)}" data-cta="guide-request-end">Request a seat ${icon('arrow')}</a>
        <a class="btn ghost" href="${p.url}">Program page</a>
      </div>
    </div>
  </div>
</section>`;

function body(p, opts) {
  return html`
<div class="storm gd on-dark" data-guide="${p.id}">
  <div class="st-stage">
    ${stormSky()}
    <div class="wrap gd-top">
      ${breadcrumbs(crumbsFor(p))}
      ${picker(p)}
    </div>
    ${hero(p, opts)}
  </div>
  ${fit4(p, opts.today)}
  ${outcomes(p)}
  ${system(p)}
  ${path(p)}
  ${projects(p)}
  ${guide3d(p)}
  ${roles(p)}
  ${credentials(p)}
  ${tuition(p)}
  ${faq(p)}
  ${steps(p, opts.today)}
</div>`;
}

/**
 * @param o.today      the build date (tests pass one)
 */
export default function guides({ today } = {}) {
  return PROGRAMS.map((p) => {
    const url = guideUrl(p);
    const t = tuitionOf(p);
    return {
      path: url,
      html: page({
        path: url, today,
        title: fit(TITLE_MAX, [`${p.name} program guide`, `${p.short} program guide`]),
        description: fit(DESC_MAX, [
          `The ${p.name} program guide: every term, lesson and graded project, the 12-week rhythm with live Jitsi classes, ${t.perTerm} per term and how to join.`,
          `The ${p.short} program guide: every term, lesson and graded project, the 12-week rhythm with live Jitsi classes, ${t.perTerm} per term and how to join.`,
          `The ${p.short} program guide: every term, lesson and project, the weekly rhythm, ${t.perTerm} per term and how to join.`,
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
