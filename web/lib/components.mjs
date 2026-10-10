// Reusable page sections. Each returns html``; behaviour is added by the browser modules in web/assets/js.
import { html, raw, accent } from './html.mjs';
import { icon, wordmark } from './icons.mjs';
import { liveDate } from './layout.mjs';
import { brochureCoverUrl, brochureCoverAlt, coverGlow } from './covers.mjs';
import { brochureUrl, CHECKED_ON, CERTS_INTRO } from './guide-data.mjs';
import { PROGRAMS, TOPICS, CREDENTIAL, P } from '../data/programs.mjs';
import { ROLES, TRACKS, CAREER_NOTE } from '../data/careers.mjs';
import { SCHEDULE, RUBRIC, FAQ, FACTS, PHOTOS } from '../data/site.mjs';
import { CERT_DISCLAIMER, certsFor } from '../data/certs.mjs';
import { QUESTIONS } from '../assets/js/match.mjs';

// id: the heading id, for a section that is aria-labelledby it.
export const sectionHead = ({ id, eyebrow, title, lede, center = false, action = '' }) => html`
<div class="shead${center ? ' center' : ''}">
  <div>${eyebrow && html`<span class="eyebrow">${eyebrow}</span>`}<h2${id ? raw(` id="${id}"`) : ''}>${accent(title)}</h2>${lede && html`<p class="lede">${lede}</p>`}</div>
  ${action}
</div>`;

export const photo = (key, { cls = 'photo', eager = false, label = true } = {}) => {
  const p = PHOTOS[key];
  return html`<figure class="${cls}"><img src="${p.src}" alt="${p.alt}" style="object-position:${p.pos}" ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async">${label && html`<figcaption>Stock photo</figcaption>`}</figure>`;
};

// ---------------------------------------------------------------- program cards and the catalog

// The Nuvora ring mark, small, for the brand row of a program card.
const mark = () => raw('<svg class="ccard-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle class="r" cx="19" cy="23" r="13.5"/><circle class="d" cx="34" cy="7" r="4.5"/></svg>');
const LEVEL_SHORT = { Certificate: 'Certificate', Bachelor: 'Bachelor’s-level', Master: 'Master’s-level' };
const needs = (p) => (p.needsBachelor ? 'Bachelor’s degree to join' : p.requiresCoding ? 'Python to start' : 'No coding to start');

// A program card with its portrait vector brochure art, brand row, title, meta line and two true chips that tell
// programs apart (the credential is the same for every program, so it is shown on program pages and certificates).
// The whole card links to the program page (the title link stretches over the card). .pcard[data-program] and
// [data-match-badge] are the hooks site.js uses to mark a visitor's saved match; [data-card] and data-topics are
// used by showcase.js. "Brochure" opens the page-by-page brochure (/programs/<slug>/brochure/). The "3D preview"
// button stays hidden until site.js wires it (preview3d.js opens the model).
export const programCard = (p) => html`
<article class="pcard ccard" data-program="${p.id}" data-level="${p.level}" data-topics="${p.topics.join('|')}" data-card>
  <div class="ccard-cover" style="--ccard-glow:${coverGlow(p)}">
    <div class="ccard-book">
      <span class="ccard-book-pages" aria-hidden="true"></span>
      <span class="ccard-book-back" aria-hidden="true"></span>
      <img class="ccard-book-face" src="${brochureCoverUrl(p)}" alt="${brochureCoverAlt(p)}" width="480" height="640" loading="lazy" decoding="async">
      <span class="ccard-book-foil" aria-hidden="true"></span>
    </div>
    <span class="ccard-3d-tag" aria-hidden="true">3D PROGRAM GUIDE</span>
    <span class="ccard-match" data-match-badge hidden><span class="chip gold">${icon('spark')} Your match</span></span>
  </div>
  <div class="ccard-body">
    <p class="ccard-brand">${mark()}<span class="ccard-org">Nuvora</span><span class="ccard-lvl">${LEVEL_SHORT[p.level]}</span></p>
    <h3><a class="ccard-link" href="${p.url}">${p.name}</a></h3>
    <p class="ccard-brochure">
      <a class="btn ghost sm" href="${brochureUrl(p)}" data-brochure-link aria-label="${p.name} brochure">Brochure</a>
      <button class="btn ghost sm" type="button" data-preview3d-trigger data-program-id="${p.id}" aria-haspopup="dialog" aria-label="3D preview of the ${p.name} program guide" hidden>3D preview</button>
    </p>
    <p class="ccard-meta"><span>${p.duration}</span> · <span>${p.weeklyHours} hrs/week</span></p>
    <ul class="ccard-chips">
      <li class="c1">Live twice a week</li><li>${needs(p)}</li>
    </ul>
  </div>
</article>`;

// The program catalog: topic tabs, picture cards and "Show N more". Without JavaScript every card shows and the
// tabs and button stay hidden; showcase.js filters by topic and reveals the rest. limit: cards shown before
// "Show more" (0 shows all). intro: the left column with the section heading, used on the home page.
export function programCatalog({ id = 'catalog', limit = 0, intro = null, programs = PROGRAMS } = {}) {
  const topics = TOPICS.filter((t) => programs.some((p) => p.topics.includes(t)));
  return html`
<div class="ccat${intro ? ' with-intro' : ''}" id="${id}" data-catalog data-program-grid data-limit="${limit}">
  ${intro && html`<div class="ccat-intro">
    <span class="eyebrow">${intro.eyebrow}</span>
    <h2 id="${intro.id}">${accent(intro.title)}</h2>
    <p>${intro.text}</p>
    <div class="ccat-links">
      <a class="link" href="/find-your-program/" data-cta="catalog-find">Find my program ${icon('arrow')}</a>
      <a class="link quiet" href="/programs/#compare">Compare programs ${icon('arrow')}</a>
    </div>
  </div>`}
  <div class="ccat-main">
    <div class="ccat-tabs" role="group" aria-label="Filter programs by topic" data-catalog-tabs hidden>
      <button type="button" aria-pressed="true" data-topic="all">All programs</button>
      ${topics.map((t) => html`<button type="button" aria-pressed="false" data-topic="${t}">${t}</button>`)}
    </div>
    <div class="cards ccat-cards" id="${id}-cards">${programs.map(programCard)}</div>
    <p class="sr-only" aria-live="polite" data-catalog-status></p>
    <div class="ccat-foot">
      <button class="btn ghost ccat-more" type="button" data-catalog-more aria-controls="${id}-cards" hidden><span>Show <span data-more-n></span> more<span class="sr-only"> programs</span></span></button>
      <p class="ccat-note">Covers are original Nuvora illustrations, not stock media.</p>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------- certificates

const lessonTitle = (p, code) => p.terms.flatMap((t) => t.lessons).find(([c]) => c === code)?.[1] ?? code;
const seal = () => raw('<svg class="certcard-seal" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle class="s1" cx="20" cy="20" r="17"/><circle class="s2" cx="18.5" cy="21.5" r="7.2"/><circle class="s3" cx="25.8" cy="13.2" r="2.6"/></svg>');
const signature = () => raw('<svg class="certcard-sig" viewBox="0 0 120 28" aria-hidden="true" focusable="false"><path d="M4 21c7-13 13-16 15-10s-5 11-1 9 9-15 15-13-2 13 4 11 7-9 13-9 4 7 10 6 9-5 17-6 12 2 18 0"/></svg>');

// One certificate card. Always a sample design, never a real certificate: wordmark, program, signature line, seal.
const certCard = (p, cls = '') => html`
<div class="certcard ${cls}">
  <div class="certcard-paper">
    <span class="certcard-wm">${wordmark()}</span>
    <span class="certcard-kind">Certificate of completion</span>
    <span class="certcard-title">${p.name}</span>
    <span class="certcard-sign">${signature()}<span>Issued by Nuvora · not an accredited degree</span></span>
  </div>
  <span class="certcard-ribbon">${seal()}</span>
</div>`;

// Three fanned sample certificates (home page), or one (program pages), labelled as a sample design.
export const certFan = (programs = ['bs-ds', 'ms-aml', 'c-py'].map(P)) => html`
<figure class="certfan${programs.length === 1 ? ' one' : ''}">
  <div class="certfan-stage" role="img" aria-label="Sample design of the Nuvora certificate of completion, shown for the ${programs.map((p) => p.name).join(', ')}">
    ${programs.map((p, i) => certCard(p, `pos-${i + 1}`))}
  </div>
  <figcaption><span class="chip blue">Sample design</span> Not a real certificate.</figcaption>
</figure>`;

// "Industry certifications to aim for next", grouped per program (home page). Text only: no logos.
export const industryCerts = () => html`
<div class="indcerts">
  <div class="indcerts-head">
    <h3>Industry certifications to aim for <span class="serif">next</span></h3>
    <p>Certifications from technology companies and certification bodies whose official exam topics overlap what a Nuvora program teaches. Each name and its exam areas were checked on the company’s official page on ${CHECKED_ON}.</p>
  </div>
  <div class="indcerts-grid">${PROGRAMS.map((p) => html`
    <div class="indcert">
      <h4><a href="${p.url}#credential">${p.short}</a></h4>
      <p class="indcert-k">Topics overlap with</p>
      <ul>${certsFor(p.id).map((c) => html`<li><b>${c.name}</b><span>${c.vendor}${c.exam ? ` · exam ${c.exam}` : ''}</span></li>`)}</ul>
    </div>`)}</div>
  <p class="note indcerts-note">${CERT_DISCLAIMER}</p>
</div>`;

// The same list for one program, with the lessons and official exam areas that overlap and the official page.
export const programCerts = (p) => html`
<div class="indcerts one">
  <h3>Industry certifications to aim for <span class="serif">next</span></h3>
  <p class="muted">${CERTS_INTRO} Checked on each company’s official page on ${CHECKED_ON}.</p>
  <ul class="indlist">${certsFor(p.id).map((c) => html`
    <li class="indrow">
      <p class="indrow-name"><b>${c.name}</b><span>${c.vendor}${c.exam ? ` · exam ${c.exam}` : ''}</span></p>
      <p><span class="indrow-k">Topics overlap with</span> ${c.lessons.map((code, i) => html`${i ? ', ' : ''}<span class="mono">${code}</span> ${lessonTitle(p, code)}`)}.</p>
      <p class="indrow-areas">${c.summarised ? 'Exam areas (summarised)' : 'Official exam areas'}: ${c.overlapAreas.join('; ')}.</p>
      ${c.status && html`<p class="indrow-status">${icon('info')}<span>${c.status}</span></p>`}
      <a class="indrow-src" href="${c.url}" rel="noopener noreferrer">Official page<span class="sr-only"> for ${c.name}</span> ${icon('arrow')}</a>
    </li>`)}</ul>
  <p class="note">${CERT_DISCLAIMER}</p>
</div>`;

// "Turn your learning into proof": the Nuvora certificate, how to list it, and industry certifications to aim for.
export const proofSection = () => html`
<section class="sec proof" id="certificates" aria-labelledby="proof-title">
  <div class="wrap">
    <div class="proof-split">
      <div class="proof-copy">
        <span class="eyebrow">${icon('cert')} Certificates</span>
        <h2 id="proof-title">${accent('Turn your learning into *proof*')}</h2>
        <p class="lede">When you complete your program, Nuvora issues a ${CREDENTIAL.short} for it. It is not an accredited degree: its weight comes from the graded projects behind it, which you can show to anyone.</p>
        <ul class="proof-list">
          <li>${icon('check')}<span><b>On your résumé:</b> list it under Certifications as “Nuvora certificate of completion” with the program name and year, and link two or three of your graded projects.</span></li>
          <li>${icon('check')}<span><b>On LinkedIn:</b> add it under Licenses &amp; certifications, with Nuvora as the issuing organization.</span></li>
          <li>${icon('check')}<span><b>Describe it plainly:</b> a certificate of completion from an online school, not a degree and not a vendor certification.</span></li>
        </ul>
      </div>
      ${certFan()}
    </div>
    ${industryCerts()}
  </div>
</section>`;

// ---------------------------------------------------------------- careers

// "Where can this take you?" — interactive career ladders.
const STEP_ICONS = ['chart', 'target', 'spark', 'rocket'];
export function careerLadder() {
  const tracks = Object.entries(TRACKS);
  return html`
<div class="ladder-wrap" data-ladder>
  <div class="tabs" role="tablist" aria-label="Career tracks">
    ${tracks.map(([id, t], i) => html`<button type="button" role="tab" id="tab-${id}" aria-selected="${i === 0 ? 'true' : 'false'}" aria-controls="track-${id}" tabindex="${i === 0 ? '0' : '-1'}">${t.title}</button>`)}
  </div>
  ${tracks.map(([id, t], i) => html`
  <div role="tabpanel" id="track-${id}" aria-labelledby="tab-${id}" ${i ? raw('hidden') : ''}>
    <ol class="ladder">
      ${t.steps.map((rid, n) => {
        const r = ROLES[rid];
        const title = n === t.steps.length - 1 && t.last ? t.last : r.title;
        return html`<li class="lstep"><button type="button" aria-expanded="${n === 0 ? 'true' : 'false'}" aria-controls="ld-${id}-${rid}" data-step>
          <span class="dot"><span class="n">${n + 1}</span>${icon(STEP_ICONS[n])}</span>
          <span class="txt"><span class="lt">${title}</span><span class="ls">${r.skills.slice(0, 2).map(([s]) => s).join(' · ')}</span></span></button></li>`;
      })}
    </ol>
    ${t.steps.map((rid, n) => roleDetail(`ld-${id}-${rid}`, rid, n === 0))}
  </div>`)}
  <p class="note">Select a role to see the skills it needs. ${CAREER_NOTE}</p>
</div>`;
}

// Whether a program has the lesson with this code in any of its terms.
const teaches = (p, code) => p.terms.some((t) => t.lessons.some(([c]) => c === code));

export const roleDetail = (domId, rid, open = false) => {
  const r = ROLES[rid];
  const m = r.skills.length;
  const covered = (p) => {
    const k = r.skills.filter(([, code]) => teaches(p, code)).length;
    return k === m ? `Teaches all ${m} skills listed` : k ? `Teaches ${k} of the ${m} skills listed` : 'Teaches related skills';
  };
  return html`
<div class="ldetail" id="${domId}" ${open ? '' : raw('hidden')}>
  <div class="stack">
    <h3>${r.title}</h3>
    <p class="muted">${r.summary}</p>
    <ul>${r.skills.map(([skill, code]) => html`<li>${icon('check')}<span>${skill} <span class="mono">${code}</span></span></li>`)}</ul>
    <a class="link" href="/careers/${rid}/">Skills and tools for this role ${icon('arrow')}</a>
  </div>
  <div class="stack">
    <span class="eyebrow">Programs for this role</span>
    <div class="progs">${r.programs.map((id) => html`<a class="has-k" href="${P(id).url}"><span>${P(id).name}</span><span class="k">${covered(P(id))}</span></a>`)}</div>
    <span class="eyebrow">Common tools in this role</span>
    <p class="muted">${r.tools.join(' · ')}</p>
  </div>
</div>`;
};

// ---------------------------------------------------------------- finder, facts, schedule, assessment

// Find my program: the first question is rendered here; web/assets/js/find.js runs the rest of the flow.
export const finder = ({ id = 'finder', compact = false, heading = 'Find my program' } = {}) => html`
<form class="finder${compact ? ' compact' : ''}" data-finder data-mode="${compact ? 'compact' : 'full'}" id="${id}" aria-labelledby="${id}-title" novalidate>
  <div class="f-head"><b id="${id}-title">${heading}</b><span class="f-steps" aria-hidden="true">${QUESTIONS.map((_, i) => html`<i class="${i === 0 ? 'done' : ''}"></i>`)}</span></div>
  <div data-f-body aria-live="polite">
    <fieldset class="f-q"><legend>${QUESTIONS[0].q}</legend>
      <div class="f-opts">${QUESTIONS[0].options.map(([v, l]) => html`<label class="f-opt"><input type="radio" name="role" value="${v}"><span>${l}</span></label>`)}</div>
    </fieldset>
  </div>
  <p class="f-foot">${icon('lock', 'ic')} Four quick questions. Your answers stay in this browser unless you choose to send them.</p>
</form>`;

export const factsBand = () => html`
<div class="wrap"><div class="facts" role="list">${FACTS.map(([b, s]) => html`<div role="listitem"><b>${b}</b><span>${s}</span></div>`)}</div></div>`;

// The live schedule with the visitor's local time filled in by the browser.
export const schedule = () => html`
<div class="schedule">
  <div class="sched">${icon('live')}<b>Live class · ${SCHEDULE.classDay}s</b><span>${SCHEDULE.classTime} US Eastern Time (ET) · ${SCHEDULE.classMinutes} minutes on Jitsi</span><span class="local" data-localtime="${SCHEDULE.classDayNo}|${SCHEDULE.classTime}"></span></div>
  <div class="sched">${icon('users')}<b>Office hours · ${SCHEDULE.officeDay}s</b><span>${SCHEDULE.officeTime} US Eastern Time (ET) · ${SCHEDULE.officeMinutes} minutes on Jitsi</span><span class="local" data-localtime="${SCHEDULE.officeDayNo}|${SCHEDULE.officeTime}"></span></div>
  <div class="sched">${icon('video')}<b>Lessons and recordings</b><span>Watch lessons any time. Sessions are recorded and stream in the portal; videos are never downloadable.</span></div>
  <div class="sched">${icon('doc')}<b>PDF notes and briefs</b><span>Lesson notes, exercise sheets and project briefs download as PDFs to keep.</span></div>
</div>`;

export const weekView = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cell = (d) => {
    if (d === 'Tue') return html`<div class="live"><b>${d}</b><strong>Live class</strong><span>${SCHEDULE.classTime} ET · ${SCHEDULE.classMinutes} min</span></div>`;
    if (d === 'Thu') return html`<div class="live"><b>${d}</b><strong>Office hours</strong><span>${SCHEDULE.officeTime} ET · ${SCHEDULE.officeMinutes} min</span></div>`;
    return html`<div class="${d === 'Sat' || d === 'Sun' ? 'rest' : ''}"><b>${d}</b><span>Lessons and project work, in your own time</span></div>`;
  };
  return html`<div class="week" aria-label="A typical week">${days.map(cell)}</div>`;
};

// The four rubric levels; the bar colours are brand tokens (two passing levels, two to revise).
const RUBRIC_BARS = ['var(--accent)', 'var(--cyan)', 'var(--gold)', 'var(--muted)'];
export const rubric = () => html`
<div class="rubric">${RUBRIC.map(([name, text, kind], i) => html`
  <div class="${kind}"><i class="bar4" style="background:${RUBRIC_BARS[i]}"></i><b>${name}</b><span class="res">${kind === 'pass' ? 'Pass' : 'Revise and resubmit'}</span><p>${text}</p></div>`)}
</div>`;

export const faqList = (items = FAQ) => html`
<div class="faq">${items.map(([q, a]) => html`<details><summary>${q}${icon('down')}</summary><p class="a">${a}</p></details>`)}</div>`;

export const ctaBand = ({ title = 'Ready to find your *next step*?', program } = {}) => html`
<section class="sec tight"><div class="wrap">
  <div class="ctaband rv" data-test="next-batch-cta">
    <div><h2>${accent(title)}</h2>
      <p class="dates">Next start ${liveDate('start', 0)} · seat requests close ${liveDate('applyBy', 0)}. Batches start on the first Monday of every month.</p></div>
    <div class="row">
      <a class="btn gold" href="/find-your-program/" data-cta="band-find">Find my program ${icon('arrow')}</a>
      <a class="btn ghost" href="/admissions/${program ? `?program=${program.id}` : ''}#request" data-cta="band-request">Request a seat</a>
    </div>
  </div>
</div></section>`;

export const foundingPanel = () => html`
<div class="founding on-dark rv">
  <div class="stack">
    <span class="eyebrow">Founding batches</span>
    <h2>Be one of our <span class="serif">first</span> learners</h2>
    <p>Nuvora has not run a batch yet, so there are no graduates, reviews or job results to show you, and we will not make any up. Here is exactly what you get, and what we will publish after each batch.</p>
    <a class="link" href="/about/#outcomes">How we will report results ${icon('arrow')}</a>
  </div>
  <ul>
    <li>${icon('check')}<span>Live Jitsi class on ${SCHEDULE.classDay}s and office hours on ${SCHEDULE.officeDay}s at ${SCHEDULE.classTime} US Eastern Time (ET), every week of the term.</span></li>
    <li>${icon('check')}<span>Every project graded by an instructor on a four-level rubric, with written feedback and resubmission.</span></li>
    <li>${icon('check')}<span>Lessons streamed in the portal, with downloadable PDF notes and briefs.</span></li>
    <li>${icon('check')}<span>After each batch: completion and pass rates, with how they were measured and how many learners they cover.</span></li>
  </ul>
</div>`;
