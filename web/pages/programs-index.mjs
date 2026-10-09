import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead, liveDate } from '../lib/layout.mjs';
import { programCatalog, sectionHead, ctaBand } from '../lib/components.mjs';
import { itemList, breadcrumbList } from '../lib/schema.mjs';
import { PROGRAMS, PACE, CREDENTIAL, TOPICS, money } from '../data/programs.mjs';
import { ROLES } from '../data/careers.mjs';

const slugTopic = (t) => t.toLowerCase().replace(/\s+/g, '-');

const ROWS = [
  ['Level', (p) => p.levelLabel],
  ['Duration', (p) => p.duration],
  ['Terms of 12 weeks', (p) => String(p.termCount)],
  ['Weekly time', (p) => `${p.weeklyHours} hours`],
  ['Learning pace', () => PACE.short],
  ['Graded projects', (p) => String(p.projects)],
  ['Tuition per term', (p) => money(p.tuition.perTerm)],
  ['Total tuition', (p) => money(p.tuition.total)],
  ['You need', (p) => p.required.join('; ')],
  ['Credential', () => `${CREDENTIAL.short} (not an accredited degree)`],
  ['Career paths', (p) => p.roles.map((r) => ROLES[r].title).join(', ')],
];

const LEVEL_CARDS = [
  ['Certificate', 'Certificates', '12 weeks · one term', 'A focused skill in one term: Python and data analysis, generative AI apps, or MLOps. A good first step or a quick upgrade.'],
  ['Bachelor', 'Bachelor’s-level programs', '3–4 years part-time · 12 terms', 'A complete foundation from Python and maths to a capstone. No degree or coding needed to start.'],
  ['Master', 'Master’s-level programs', '12–18 months · 4 terms', 'Advanced, production-focused study for people who already have a bachelor’s degree and some Python.'],
];

const body = () => html`
${pageHead({ eyebrow: 'Programs', title: accent('Programs in data science and *AI*'), lede: 'Seven programs, all taught in 12-week terms with lessons on demand, two live Jitsi sessions a week and instructor-graded projects. Compare them on the facts that matter.', crumbs: [['/', 'Home'], ['/programs/', 'Programs']] })}
<section class="sec" aria-labelledby="levels-title">
  <div class="wrap">
    <h2 class="sr-only" id="levels-title">Programs by level</h2>
    <div class="twocol" style="margin-bottom:36px">
      ${LEVEL_CARDS.map(([lvl, title, len, text]) => html`<div class="box"><span class="eyebrow">${len}</span><h3>${title}</h3><p class="muted">${text}</p>
        <p class="small"><b>${PROGRAMS.filter((p) => p.level === lvl).length}</b> ${PROGRAMS.filter((p) => p.level === lvl).length === 1 ? 'program' : 'programs'} · from ${money(PROGRAMS.find((p) => p.level === lvl).tuition.perTerm)} per term</p></div>`)}
    </div>
    ${programCatalog({ id: 'programs-catalog' })}
    <p class="row small muted" style="margin-top:22px">Browse by topic: ${TOPICS.map((t) => html`<a class="chip blue" href="/learn/${slugTopic(t)}/">${t}</a>`)}</p>
  </div>
</section>
<section class="sec tinted" id="compare" aria-labelledby="compare-title">
  <div class="wrap">
    ${sectionHead({ id: 'compare-title', eyebrow: 'Side by side', title: 'Compare *every* program', lede: `All programs start on the first Monday of a month. The next start is on the date shown at the top of the page.`, action: html`<a class="link" href="/find-your-program/">Not sure? Find my program ${icon('arrow')}</a>` })}
    <div class="tablewrap compare" tabindex="0" role="region" aria-labelledby="compare-title">
      <table style="min-width:1100px">
        <thead><tr><th scope="col">Program</th>${PROGRAMS.map((p) => html`<th scope="col"><a href="${p.url}">${p.short}</a></th>`)}</tr></thead>
        <tbody>${ROWS.map(([label, f]) => html`<tr><th scope="row">${label}</th>${PROGRAMS.map((p) => html`<td>${f(p)}</td>`)}</tr>`)}
          <tr><th scope="row">Next start</th>${PROGRAMS.map(() => html`<td>${liveDate('start', 0)}</td>`)}</tr></tbody>
      </table>
    </div>
  </div>
</section>
${ctaBand()}`;

export default function programsIndex() {
  return [{
    path: '/programs/',
    html: page({
      path: '/programs/',
      title: 'Data science and AI programs: compare all 7',
      description: 'Compare Nuvora’s 7 programs in data science, machine learning, generative AI and MLOps: duration, weekly hours, projects, tuition and career paths.',
      body: body(),
      schema: [itemList(PROGRAMS.map((p) => [p.url, p.name])), breadcrumbList([['/', 'Home'], ['/programs/', 'Programs']])],
    }),
  }];
}
