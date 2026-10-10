import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, breadcrumbs, liveDate } from '../lib/layout.mjs';
import { schedule, rubric, faqList, ctaBand, certFan, programCerts } from '../lib/components.mjs';
import { course, breadcrumbList, faqPage } from '../lib/schema.mjs';
import { coverGlow, brochureCoverUrl, brochureCoverAlt } from '../lib/covers.mjs';
import { PROGRAMS, PACE, CREDENTIAL, money, nextStarts, termDates, fmtDay, isoDay, lowerFirst } from '../data/programs.mjs';
import { ROLES, CAREER_NOTE } from '../data/careers.mjs';
import { SCHEDULE } from '../data/site.mjs';
import { guideFaq, pathLede, TUITION_NOTE } from '../lib/guide-data.mjs';

const week = (day) => Math.ceil(day / 7);

// Search-result limits (tests/site/build.test.mjs): the title gets " | Nuvora" added, so 61 characters are left.
const TITLE_MAX = 61, DESC_MAX = 170;
// The first candidate that fits; candidates go from the most complete to the shortest.
const fit = (max, candidates) => candidates.find((s) => s.length <= max) ?? candidates[candidates.length - 1];

const SECTIONS = [['overview', 'Overview'], ['curriculum', 'Curriculum'], ['projects', 'Projects'], ['workload', 'Duration & workload'],
  ['assessment', 'Assessment'], ['instructors', 'Instructors'], ['tuition', 'Tuition & financing'], ['credential', 'Credential & credit'],
  ['careers', 'Careers'], ['faq', 'FAQ']];

// The same questions as the program guide (web/lib/guide-data.mjs), so both pages always answer alike.
const faqFor = guideFaq;

function hero(p, today) {
  const crumbs = [['/', 'Home'], ['/programs/', 'Programs'], [p.url, p.name]];
  return html`
<section class="phero on-dark" data-hero>
  <div class="wrap phero-in">
    <div>
      ${breadcrumbs(crumbs)}
      <div class="row" style="margin-top:16px"><span class="chip gold">${p.levelLabel}</span>${p.topics.map((t) => html`<span class="chip frost">${t}</span>`)}</div>
      <h1>${p.name}</h1>
      <p class="lede">${p.tagline}</p>
      <p class="credline">${icon('cert')}<span>Leads to a <b>${CREDENTIAL.short}</b>. ${CREDENTIAL.note}</span></p>
      <div class="row" style="margin-top:22px">
        <a class="btn gold" href="/admissions/?program=${p.id}#request" data-cta="program-request">Request a seat ${icon('arrow')}</a>
        <a class="btn ghost" href="/find-your-program/" data-cta="program-find">Is this right for me?</a>
      </div>
      <p class="row phero-guide" style="margin-top:12px" data-test="guide-links">
        <a class="btn ghost sm" href="${p.url}guide/" data-cta="program-guide">${icon('route')}Program guide</a>
        <a class="btn ghost sm" href="${p.url}brochure/" data-cta="program-brochure">${icon('book')}Read the brochure</a>
      </p>
    </div>
    <aside class="keyfacts" aria-labelledby="kf-title">
      <h2 id="kf-title">Key facts</h2>
      <dl class="kv" data-test="key-facts">
        <div><dt>Who it’s for</dt><dd>${p.audience[0]}</dd></div>
        <div><dt>You need</dt><dd>${p.required[0]}</dd></div>
        <div><dt>Weekly time</dt><dd>${p.weeklyHours} hours</dd></div>
        <div><dt>Duration</dt><dd>${p.duration}</dd></div>
        <div><dt>Learning pace</dt><dd>${PACE.short}</dd></div>
        <div><dt>Next start</dt><dd>${liveDate('start', 0, today)}</dd></div>
        <div><dt>Apply by</dt><dd>${liveDate('applyBy', 0, today)}</dd></div>
        <div><dt>Tuition</dt><dd>${money(p.tuition.perTerm)} per term${p.termCount > 1 ? html`<br><span class="muted small">${money(p.tuition.total)} for ${p.termCount} terms</span>` : ''}</dd></div>
        <div><dt>Credential</dt><dd>${CREDENTIAL.short}</dd></div>
      </dl>
    </aside>
  </div>
</section>`
}

const termBlock = (t, i, open) => html`
<details class="term" id="term-${i + 1}" ${open ? 'open' : ''}>
  <summary><span class="tn">${i + 1}</span><span><b>${t.title}</b><br><span>${t.lessons.length} lessons · ${t.projects.length} projects · 12 weeks</span></span>${icon('down')}</summary>
  <div class="tbody">
    <div><h3>Lessons<span class="sr-only"> in term ${i + 1}</span></h3><ul>${t.lessons.map(([code, title]) => html`<li><span class="mono">${code}</span><span>${title}</span></li>`)}</ul></div>
    <div><h3>Graded projects<span class="sr-only"> in term ${i + 1}</span></h3><ul>${t.projects.map(([title, day]) => html`<li>${icon('folder')}<span>${title}</span><span class="due">week ${week(day)}</span></li>`)}</ul></div>
  </div>
</details>`

const termPath = (p, today) => {
  const start = nextStarts(1, today)[0].start;
  const rows = termDates(start, p.termCount);
  const shown = p.termCount > 4 ? [...rows.slice(0, 3), null, rows[rows.length - 1]] : rows;
  return html`
<div class="tablewrap" style="margin-top:18px"><table data-termpath="${p.termCount}">
  <caption>If you start on ${fmtDay(start)}</caption>
  <thead><tr><th scope="col">Term</th><th scope="col">Starts</th><th scope="col">Ends</th></tr></thead>
  <tbody>${shown.map((r) => (r ? html`<tr data-term="${r.term}"><th scope="row">Term ${r.term}: ${p.terms[r.term - 1].title}</th><td><time datetime="${isoDay(r.start)}">${fmtDay(r.start)}</time></td><td><time datetime="${isoDay(r.end)}">${fmtDay(r.end)}</time></td></tr>`
    : html`<tr><td colspan="3" class="muted">… ${p.termCount - 4} more terms, one after another …</td></tr>`))}</tbody>
</table></div>`
}

function body(p, today) {
  const roles = p.roles.map((r) => [r, ROLES[r]]);
  const projectTitles = p.terms.flatMap((t) => t.projects.map(([title]) => title));
  return html`
${hero(p, today)}
<div class="wrap">
  <div class="jumpnav"><nav aria-label="On this page" data-jumpnav>${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav></div>

  <!-- 3D Book Watermark - Fixed position, light shade, 20% visibility -->
  <div class="book-watermark-container">
    <div class="book-watermark" data-program-watermark>
      <div class="book-3d-stage">
        <div class="book-3d-book" style="--book-glow:${coverGlow(p)}">
          <div class="book-3d-book-pages" aria-hidden="true"></div>
          <div class="book-3d-book-back" aria-hidden="true"></div>
          <img class="book-3d-book-face" src="${brochureCoverUrl(p)}" alt="${brochureCoverAlt(p)}" loading="lazy" decoding="async">
          <div class="book-3d-book-foil" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  </div>

  <section class="psec" id="overview" aria-labelledby="h-overview">
    <h2 id="h-overview">${accent('Is it *right for you*?')}</h2>
    <p class="lede">${p.tagline}</p>
    <div class="twocol">
      <div class="box"><h3>${icon('users')} Who it’s for</h3><ul class="ticks">${p.audience.map((a) => html`<li>${icon('check')}<span>${a}</span></li>`)}</ul></div>
      <div class="box"><h3>${icon('book')} What you need</h3><ul>${p.required.map((r) => html`<li>${r}</li>`)}</ul>
        <p class="small muted"><b>Helpful:</b> ${p.helpful.join(', ')}</p></div>
      <div class="box"><h3>${icon('layers')} Tools you will use</h3><div class="row">${p.tools.map((t) => html`<span class="chip blue">${t}</span>`)}</div></div>
    </div>
  </section>

  <section class="psec" id="curriculum" aria-labelledby="h-curriculum">
    <h2 id="h-curriculum">${accent('The *curriculum*')}</h2>
    <p class="lede">${pathLede(p)}</p>
    <div class="terms">${p.terms.map((t, i) => termBlock(t, i, i === 0))}</div>
  </section>

  <section class="psec" id="projects" aria-labelledby="h-projects">
    <h2 id="h-projects">${accent(`${p.projects} *graded projects*`)}</h2>
    <p class="lede">You learn by building. Every project is assessed by an instructor, and your work stays in your portfolio.</p>
    <div class="twocol">
      <div class="box"><h3>${icon('rocket')} Capstone</h3><p>${p.capstone}</p></div>
      <div class="box"><h3>${icon('folder')} Examples from the plan</h3><ul>${projectTitles.slice(0, 5).map((t) => html`<li>${t}</li>`)}</ul></div>
    </div>
  </section>

  <section class="psec" id="workload" aria-labelledby="h-workload">
    <h2 id="h-workload">${accent('Duration and *workload*')}</h2>
    <p class="lede">${p.duration}. Plan for about ${p.weeklyHours} hours a week: ${lowerFirst(PACE.long)}.</p>
    ${schedule()}
    ${termPath(p, today)}
  </section>

  <section class="psec" id="assessment" aria-labelledby="h-assessment">
    <h2 id="h-assessment">${accent('How you are *assessed*')}</h2>
    <p class="lede">Projects are graded by instructors on a four-level mastery rubric. A lesson counts as complete when you have watched 90% of it.</p>
    ${rubric()}
  </section>

  <section class="psec" id="instructors" aria-labelledby="h-instructors">
    <h2 id="h-instructors">${accent('Your *instructors*')}</h2>
    <div class="twocol">
      <div class="box"><h3>${icon('users')} Announced before each batch</h3><p class="muted">Instructors are confirmed for each batch before it starts. Their names, backgrounds and public profiles will be listed here, with their permission. We do not show placeholder people.</p></div>
      <div class="box"><h3>${icon('live')} What instructors do</h3><ul class="ticks"><li>${icon('check')}<span>Teach the live ${SCHEDULE.classDay} class and run ${SCHEDULE.officeDay} office hours</span></li><li>${icon('check')}<span>Grade every project with written feedback</span></li><li>${icon('check')}<span>See you on their check-in list after 14 days without activity</span></li></ul></div>
  </div>
</section>

  <section class="psec" id="tuition" aria-labelledby="h-tuition">
    <h2 id="h-tuition">${accent('Tuition and *financing*')}</h2>
    <p class="lede">${TUITION_NOTE}</p>
    <div class="tablewrap" data-test="fees"><table style="min-width:0">
      <tbody>
        <tr><th scope="row">Tuition per 12-week term</th><td><b>${money(p.tuition.perTerm)}</b></td></tr>
        <tr><th scope="row">Number of terms</th><td>${p.termCount}</td></tr>
        <tr><th scope="row">Total tuition</th><td><b>${money(p.tuition.total)}</b></td></tr>
        <tr><th scope="row">Application fee</th><td>${money(p.tuition.applicationFee)}, once</td></tr>
        <tr><th scope="row">Financing</th><td>Pay per term. Loans, instalments within a term and scholarships are not offered yet.</td></tr>
        <tr><th scope="row">Refunds and deferrals</th><td>The policy will be published before the first batch, and you will see it before you pay. <a href="/tuition/#refunds">Details</a></td></tr>
      </tbody>
    </table></div>
  </section>

  <section class="psec" id="credential" aria-labelledby="h-credential">
    <h2 id="h-credential">${accent('Credential and *credit*')}</h2>
    <div class="cred-split">
      <div class="stack">
        <p class="lede">Your certificate names the program and is backed by the graded projects you can show. List it on your résumé under Certifications, and on LinkedIn under Licenses &amp; certifications with Nuvora as the issuing organization.</p>
      </div>
      ${certFan([p])}
    </div>
    <div class="twocol">
      <div class="box"><h3>${icon('cert')} What you receive</h3><p>A ${CREDENTIAL.short} for the ${p.name}, issued by Nuvora when you complete your program.</p></div>
      <div class="box"><h3>${icon('info')} Recognition</h3><p>Nuvora is not an accredited university and this is not an accredited degree. The ${p.credits} Nuvora credits${p.termCount > 1 ? ` (about ${p.creditsPerTerm} per term)` : ''} describe workload; they are not academic credit and may not transfer to universities.</p></div>
      <div class="box"><h3>${icon('layers')} Transfer and test-outs</h3><p>Nuvora does not accept transfer credit or offer test-outs: every learner completes every term.${p.needsBachelor ? ' Joining needs a bachelor’s degree in any field.' : ''}</p></div>
    </div>
    ${programCerts(p)}
  </section>

  <section class="psec" id="careers" aria-labelledby="h-careers">
    <h2 id="h-careers">${accent('Career *pathways*')}</h2>
    <p class="lede">Roles this curriculum is designed for. Open one to see the skills it needs and where this program teaches them.</p>
    <div class="roles">${roles.map(([id, r]) => html`<a class="role" href="/careers/${id}/"><b>${r.title}</b><span>${r.summary}</span></a>`)}</div>
    <p class="note" style="margin-top:14px">${CAREER_NOTE}</p>
  </section>

  <section class="psec" id="faq" aria-labelledby="h-faq">
    <h2 id="h-faq">${accent('Questions about this *program*')}</h2>
    ${faqList(faqFor(p))}
  </section>
</div>
${ctaBand({ title: `Start the *${p.short}*`, program: p })}
<div class="sticky-cta" data-sticky-cta aria-hidden="true">
  <div class="wrap"><div class="txt"><b>${p.short}</b><br><span>Next start ${liveDate('start', 0, today)} · ${money(p.tuition.perTerm)} per term</span></div>
  <a class="btn gold sm" href="/admissions/?program=${p.id}#request" tabindex="-1">Request a seat</a></div>
</div>`;
}

export default function programs({ today } = {}) {
  return PROGRAMS.map((p) => ({
    path: p.url,
    html: page({
      path: p.url, today,
      title: fit(TITLE_MAX, [`${p.name} · online, ${p.termCount === 1 ? '12 weeks' : p.duration}`, `${p.name} · online`, p.name]),
      description: fit(DESC_MAX, [
        `${p.tagline} ${p.duration}, ${p.weeklyHours} hours a week, ${money(p.tuition.perTerm)} per term. ${CREDENTIAL.short}, not an accredited degree.`,
        `${p.tagline} ${p.duration}, ${p.weeklyHours} hours a week, ${money(p.tuition.perTerm)} per term. Not an accredited degree.`,
        `${p.tagline} ${p.duration}, ${p.weeklyHours} hours a week. Not an accredited degree.`,
        `${p.tagline} ${p.duration}, ${p.weeklyHours} hours a week.`,
      ]),
      body: body(p, today),
      schema: [course(p, today), breadcrumbList([['/', 'Home'], ['/programs/', 'Programs'], [p.url, p.name]]), faqPage(faqFor(p))],
      scripts: ['/js/program.js'],
    }),
  }));
}
