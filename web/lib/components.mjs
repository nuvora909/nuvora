// Reusable page sections. Each returns html``; behaviour is added by the browser modules in web/assets/js.
import { html, raw, accent } from './html.mjs';
import { icon } from './icons.mjs';
import { liveDate } from './layout.mjs';
import { PROGRAMS, PACE, CREDENTIAL, money, P } from '../data/programs.mjs';
import { ROLES, TRACKS, CAREER_NOTE } from '../data/careers.mjs';
import { SCHEDULE, RUBRIC, FAQ, FACTS, PHOTOS } from '../data/site.mjs';
import { QUESTIONS } from '../assets/js/match.mjs';

export const sectionHead = ({ eyebrow, title, lede, center = false, action = '' }) => html`
<div class="shead${center ? ' center' : ''}">
  <div>${eyebrow && html`<span class="eyebrow">${eyebrow}</span>`}<h2>${accent(title)}</h2>${lede && html`<p class="lede">${lede}</p>`}</div>
  ${action}
</div>`;

export const photo = (key, { cls = 'photo', eager = false, label = true } = {}) => {
  const p = PHOTOS[key];
  return html`<figure class="${cls}"><img src="${p.src}" alt="${p.alt}" style="object-position:${p.pos}" ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async">${label && html`<figcaption>Stock photo</figcaption>`}</figure>`;
};

const roleTitles = (p) => p.roles.map((r) => ROLES[r].title);

// Decision-ready program card: duration, pace, weekly commitment, credential, projects, tuition, career paths.
export const programCard = (p) => html`
<article class="pcard" data-program="${p.id}" data-level="${p.level}" data-topics="${p.topics.join('|')}" style="--a:${p.colors[0]};--b:${p.colors[1]}">
  <div class="thumb">
    <span class="lvl">${p.levelLabel}${p.termCount > 1 ? ` · ${p.termCount} terms` : ''}</span>
    <div class="topics">${p.topics.map((t) => html`<span class="chip frost">${t}</span>`)}</div>
    <span class="match" data-match-badge hidden><span class="chip gold">${icon('spark')} Your match</span></span>
  </div>
  <div class="pbody">
    <h3><a href="${p.url}">${p.name}</a></h3>
    <p class="tag">${p.tagline}</p>
    <dl class="pfacts">
      <div><dt>${icon('cal')}Duration</dt><dd>${p.duration}</dd></div>
      <div><dt>${icon('pace')}Learning pace</dt><dd>${PACE.short}</dd></div>
      <div><dt>${icon('clock')}Weekly</dt><dd>${p.weeklyHours} hrs/week</dd></div>
      <div><dt>${icon('folder')}Projects</dt><dd>${p.projects} graded projects</dd></div>
      <div><dt>${icon('coin')}Tuition from</dt><dd>${money(p.tuition.perTerm)} per term</dd></div>
      <div><dt>${icon('cert')}Credential</dt><dd>Nuvora certificate</dd></div>
      <div class="wide"><dt>${icon('route')}Career paths</dt><dd>${roleTitles(p).join(' · ')}</dd></div>
    </dl>
    <div class="pfoot">
      <span class="cred">${CREDENTIAL.short}<br>Not an accredited degree</span>
      <a class="btn primary sm" href="${p.url}" aria-label="View program: ${p.name}">View program ${icon('arrow')}</a>
    </div>
  </div>
</article>`;

const finderTile = () => html`
<a class="ptile" href="/find-your-program/" data-cta="grid-find">
  <span class="eyebrow">${icon('spark')} Not sure which?</span>
  <b>Find the program that fits you</b>
  <span>Four questions about your background, goal and time. You get a match, the reasons, and your term-by-term learning path.</span>
  <span class="btn gold sm">Find my program ${icon('arrow')}</span>
</a>`;

export const programGrid = (programs = PROGRAMS, { tabs = true, promo = true } = {}) => html`
<div data-program-grid>
  ${tabs && html`<div class="tabs" role="group" aria-label="Filter programs by level">
    <button type="button" aria-pressed="true" data-filter="all">All programs</button>
    <button type="button" aria-pressed="false" data-filter="Certificate">Certificates · 12 weeks</button>
    <button type="button" aria-pressed="false" data-filter="Bachelor">Bachelor’s-level · 3–4 years</button>
    <button type="button" aria-pressed="false" data-filter="Master">Master’s-level · 12–18 months</button>
  </div>`}
  <div class="cards">${programs.map(programCard)}${promo && finderTile()}</div>
</div>`;

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

export const roleDetail = (domId, rid, open = false) => {
  const r = ROLES[rid];
  return html`
<div class="ldetail" id="${domId}" ${open ? '' : raw('hidden')}>
  <div class="stack">
    <h3>${r.title}</h3>
    <p class="muted">${r.summary}</p>
    <ul>${r.skills.map(([skill, code]) => html`<li>${icon('check')}<span>${skill} <span class="mono">${code}</span></span></li>`)}</ul>
    <a class="link" href="/careers/${rid}/">Skills and tools for this role ${icon('arrow')}</a>
  </div>
  <div class="stack">
    <span class="eyebrow">Programs that teach these skills</span>
    <div class="progs">${r.programs.map((id) => html`<a href="${P(id).url}">${P(id).name}</a>`)}</div>
    <span class="eyebrow">Tools you will use</span>
    <p class="muted">${r.tools.join(' · ')}</p>
  </div>
</div>`;
};

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
  <div class="sched">${icon('live')}<b>Live class · ${SCHEDULE.classDay}s</b><span>${SCHEDULE.classTime} India time (IST) · ${SCHEDULE.classMinutes} minutes on Zoom</span><span class="local" data-localtime="${SCHEDULE.classDayNo}|${SCHEDULE.classTime}"></span></div>
  <div class="sched">${icon('users')}<b>Office hours · ${SCHEDULE.officeDay}s</b><span>${SCHEDULE.officeTime} India time (IST) · ${SCHEDULE.officeMinutes} minutes on Zoom</span><span class="local" data-localtime="${SCHEDULE.officeDayNo}|${SCHEDULE.officeTime}"></span></div>
  <div class="sched">${icon('video')}<b>Lessons and recordings</b><span>Watch lessons any time. Sessions are recorded and stream in the portal; videos are never downloadable.</span></div>
  <div class="sched">${icon('doc')}<b>PDF notes and briefs</b><span>Lesson notes, exercise sheets and project briefs download as PDFs to keep.</span></div>
</div>`;

export const weekView = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cell = (d) => {
    if (d === 'Tue') return html`<div class="live"><b>${d}</b><strong>Live class</strong><span>${SCHEDULE.classTime} IST · ${SCHEDULE.classMinutes} min</span></div>`;
    if (d === 'Thu') return html`<div class="live"><b>${d}</b><strong>Office hours</strong><span>${SCHEDULE.officeTime} IST · ${SCHEDULE.officeMinutes} min</span></div>`;
    return html`<div class="${d === 'Sat' || d === 'Sun' ? 'rest' : ''}"><b>${d}</b><span>Lessons and project work, at your own time</span></div>`;
  };
  return html`<div class="week" aria-label="A typical week">${days.map(cell)}</div>`;
};

export const rubric = () => html`
<div class="rubric">${RUBRIC.map(([name, text, kind], i) => html`
  <div class="${kind}"><i class="bar4" style="background:${['#0B6BF5', '#38BDF8', '#F5B82E', '#94A3B8'][i]}"></i><b>${name}</b><span class="res">${kind === 'pass' ? 'Pass' : 'Revise and resubmit'}</span><p>${text}</p></div>`)}
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
<div class="founding rv">
  <div class="stack">
    <span class="eyebrow" style="color:var(--gold-2)">Founding batches</span>
    <h2>Be one of our <span class="serif">first</span> learners</h2>
    <p>Nuvora has not run a batch yet, so there are no graduates, reviews or job results to show you, and we will not make any up. Here is exactly what you get, and what we will publish after each batch.</p>
    <a class="link" href="/about/#outcomes" style="color:var(--gold-2)">How we will report results ${icon('arrow')}</a>
  </div>
  <ul>
    <li>${icon('check')}<span>Live Zoom class on ${SCHEDULE.classDay}s and office hours on ${SCHEDULE.officeDay}s at ${SCHEDULE.classTime} IST, every week of the term.</span></li>
    <li>${icon('check')}<span>Every project graded by an instructor on a four-level rubric, with written feedback and resubmission.</span></li>
    <li>${icon('check')}<span>Lessons streamed in the portal, with downloadable PDF notes and briefs.</span></li>
    <li>${icon('check')}<span>After each batch: completion and pass rates, with how they were measured and how many learners they cover.</span></li>
  </ul>
</div>`;
