// Career paths. /careers/ shows the three tracks, a role explorer that can be filtered by track and by program,
// and a program-to-role table. /careers/<role-id>/ shows one role: what it does, the skills it uses and the
// Nuvora lesson and term that teach each one, where it sits in each track, and the programs that cover it.
// Everything is built from web/data/careers.mjs and the catalog. These are typical industry progressions, not
// promised outcomes: Nuvora is pre-launch and does not guarantee jobs, promotions or salaries.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { careerLadder, programCard, faqList, ctaBand } from '../lib/components.mjs';
import { breadcrumbList, faqPage, itemList } from '../lib/schema.mjs';
import { PROGRAMS, CREDENTIAL, P } from '../data/programs.mjs';
import { ROLES, TRACKS, CAREER_NOTE } from '../data/careers.mjs';
import { TERMS } from '../../scripts/catalog.mjs';

const ROLE_IDS = Object.keys(ROLES);
const TRACK_IDS = Object.keys(TRACKS);
const roleUrl = (rid) => `/careers/${rid}/`;

// Decorative icon per role (the role name is always shown as text next to it).
const ROLE_ICON = {
  'data-analyst': 'chart', 'senior-data-analyst': 'target', 'data-scientist': 'pulse', 'analytics-manager': 'users',
  'ml-ai-specialist': 'spark', 'ml-engineer': 'layers', 'ai-engineer': 'chat', 'ai-product-lead': 'rocket', 'mlops-engineer': 'route',
};

// ---------- lookups ----------

// Every place a lesson code is taught, across all programs: code -> [{ p, n, termTitle, lesson }] in catalog order.
const TAUGHT = new Map();
for (const [pid, terms] of Object.entries(TERMS)) {
  const p = P(pid);
  if (!p) continue;
  terms.forEach((t, i) => t.lessons.forEach(([code, lesson]) => {
    if (!TAUGHT.has(code)) TAUGHT.set(code, []);
    TAUGHT.get(code).push({ p, n: i + 1, termTitle: t.title, lesson });
  }));
}
const teaches = (p, code) => (TAUGHT.get(code) || []).some((w) => w.p.id === p.id);

// Where a skill is taught, with the role's own programs first.
const whereTaught = (rid, code) => {
  const order = (w) => { const i = programsFor(rid).findIndex((p) => p.id === w.p.id); return i < 0 ? 99 : i; };
  return [...(TAUGHT.get(code) || [])].sort((a, b) => order(a) - order(b));
};

// Programs for a role: the role's own list, plus any program whose curriculum names the role.
function programsFor(rid) {
  const listed = ROLES[rid].programs;
  const extra = PROGRAMS.filter((p) => p.roles.includes(rid) && !listed.includes(p.id)).map((p) => p.id);
  return [...listed, ...extra].map(P).filter(Boolean);
}
// designed: the program lists the role as one of its career paths (PROGRAMS[].roles).
// related: the role lists the program (ROLES[].programs), but the program is aimed at other roles.
// Exact lesson coverage is shown separately, on the role pages.
const relation = (p, rid) => (p.roles.includes(rid) ? 'designed' : ROLES[rid].programs.includes(p.id) ? 'related' : null);
const RELATION = { designed: 'Designed for this role', related: 'Builds related skills', none: 'Not a focus' };

// Lessons a program teaches in the same subjects (code prefix, e.g. AIS) as the role's skills, excluding the exact
// skill lessons. Shown when a program includes none of the role's own skill lessons.
const sameSubject = (p, rid) => {
  const subjects = new Set(ROLES[rid].skills.map(([, code]) => code.split('-')[0]));
  const exact = new Set(ROLES[rid].skills.map(([, code]) => code));
  return p.terms.flatMap((t) => t.lessons).filter(([code]) => subjects.has(code.split('-')[0]) && !exact.has(code));
};

const tracksFor = (rid) => TRACK_IDS.filter((tid) => TRACKS[tid].steps.includes(rid));
// Links always carry the title of the role page they open (TRACKS[].last is a wider label used by the home ladder).
const stepLabel = (tid, n) => ROLES[TRACKS[tid].steps[n]].title;

// ---------- words ----------
const an = (title) => (/^(?:[AEIOU]|ML\b|MLOps\b)/.test(title) ? 'an' : 'a');
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const coverage = (p, rid) => ROLES[rid].skills.filter(([, code]) => teaches(p, code));

// A section heading in the shared .shead style, with an id the section can be labelled by.
const head = ({ id, eyebrow, title, lede, action = '', center = false }) => html`
<div class="shead${center ? ' center' : ''}">
  <div>${eyebrow && html`<span class="eyebrow">${eyebrow}</span>`}<h2 id="${id}">${accent(title)}</h2>${lede && html`<p class="lede">${lede}</p>`}</div>
  ${action}
</div>`;

// =====================================================================================================
// /careers/
// =====================================================================================================

const intro = () => html`
<section class="sec tight" aria-labelledby="cr-intro-title">
  <div class="wrap cr-intro">
    <div class="stack">
      <span class="eyebrow">Start here</span>
      <h2 id="cr-intro-title">${accent('How data and AI careers *grow*')}</h2>
      <p class="lede">Careers in data and AI tend to build step by step. A first role leans on SQL, Python and clear charts. Later roles add experiments and modeling, production machine learning systems, or leading a team.</p>
      <p class="muted">This page maps those steps to what Nuvora teaches. Every skill listed for a role points to a Nuvora lesson, the program term that teaches it and the programs that cover it.</p>
    </div>
    <ol class="cr-steps">
      <li><span class="cr-n" aria-hidden="true">1</span><b>Pick a track</b><p>${plural(TRACK_IDS.length, 'typical progression')}, from a first data role to senior and lead roles. <a href="#tracks">See the tracks</a></p></li>
      <li><span class="cr-n" aria-hidden="true">2</span><b>Compare the roles</b><p>Filter all ${ROLE_IDS.length} roles by track or by the program you are considering. <a href="#roles">Explore roles</a></p></li>
      <li><span class="cr-n" aria-hidden="true">3</span><b>Check the skills</b><p>Each role page lists its skills, the Nuvora lesson for each and the program term that teaches it.</p></li>
    </ol>
  </div>
</section>`;

const tracksSection = () => html`
<section class="sec dark on-dark" id="tracks" aria-labelledby="cr-tracks-title">
  <div class="wrap">
    ${head({ id: 'cr-tracks-title', eyebrow: html`${icon('ladder')} Career tracks`, title: 'Where each path can *lead*',
      lede: 'Pick a track, then select a role to see the skills it needs and the programs that teach them.' })}
    ${careerLadder()}
    <div class="cr-tracks">
      ${TRACK_IDS.map((tid) => html`
      <div class="cr-trk">
        <h3>${TRACKS[tid].title}</h3>
        <ol>${TRACKS[tid].steps.map((rid, n) => html`<li><span class="cr-tn" aria-hidden="true">${n + 1}</span><a href="${roleUrl(rid)}">${stepLabel(tid, n)}</a></li>`)}</ol>
      </div>`)}
    </div>
  </div>
</section>`;

const roleCard = (rid) => {
  const r = ROLES[rid];
  const progs = programsFor(rid);
  const tracks = tracksFor(rid);
  return html`
<article class="cr-card" data-cr-role="${rid}" data-tracks="${tracks.join('|')}" data-programs="${progs.map((p) => p.id).join('|')}" aria-labelledby="cr-r-${rid}">
  <div class="cr-ctop">
    <span class="cr-ico">${icon(ROLE_ICON[rid] || 'target')}</span>
    <ul class="cr-tchips" aria-label="Career tracks">${tracks.map((tid) => html`<li class="chip">${TRACKS[tid].title}</li>`)}</ul>
  </div>
  <h3 id="cr-r-${rid}"><a href="${roleUrl(rid)}">${r.title}</a></h3>
  <p class="cr-sum">${r.summary}</p>
  <div>
    <span class="cr-k">Key skills</span>
    <ul class="cr-skl">${r.skills.slice(0, 3).map(([skill, code]) => html`<li>${icon('check')}<span>${skill}</span><span class="mono">${code}</span></li>`)}</ul>
  </div>
  <div>
    <span class="cr-k">Programs for this role</span>
    <ul class="cr-progs">${progs.map((p) => html`<li><a href="${p.url}">${p.short}</a></li>`)}</ul>
  </div>
  <a class="link cr-more" href="${roleUrl(rid)}">Skills and learning path<span class="sr-only">: ${r.title}</span> ${icon('arrow')}</a>
</article>`;
};

const explorer = () => html`
<section class="sec" id="roles" aria-labelledby="cr-roles-title">
  <div class="wrap" data-cr-explorer>
    ${head({ id: 'cr-roles-title', eyebrow: 'Role explorer', title: `All ${ROLE_IDS.length} *roles*`,
      lede: 'Each card shows what the role does, three of the skills it uses and the Nuvora programs for it. Filter by career track or by a program you are considering.' })}
    <div class="cr-filters" data-cr-filters hidden>
      <div class="cr-fgroup">
        <span class="cr-flabel" id="cr-f-track">Track</span>
        <div class="tabs cr-tabs" role="group" aria-labelledby="cr-f-track">
          <button type="button" aria-pressed="true" data-cr-track="all">All tracks</button>
          ${TRACK_IDS.map((tid) => html`<button type="button" aria-pressed="false" data-cr-track="${tid}">${TRACKS[tid].title}</button>`)}
        </div>
      </div>
      <div class="cr-fgroup">
        <span class="cr-flabel" id="cr-f-prog">Program</span>
        <div class="tabs cr-tabs" role="group" aria-labelledby="cr-f-prog">
          <button type="button" aria-pressed="true" data-cr-program="all">All programs</button>
          ${PROGRAMS.map((p) => html`<button type="button" aria-pressed="false" data-cr-program="${p.id}">${p.short}</button>`)}
        </div>
      </div>
      <p class="cr-status" role="status" data-cr-status>Showing all ${ROLE_IDS.length} roles</p>
    </div>
    <div class="cr-grid">${ROLE_IDS.map(roleCard)}</div>
    <div class="cr-empty" data-cr-empty hidden>
      <p><b>No role matches both filters.</b> That program is not listed for any role in this track. Try another track or program.</p>
      <button class="btn ghost sm" type="button" data-cr-reset>Show all roles</button>
    </div>
  </div>
</section>`;

const MARK_CLASS = { designed: 'cr-mk cr-mk-d', related: 'cr-mk cr-mk-r', none: 'cr-mk cr-mk-n' };
const mark = (kind) => html`<span class="${MARK_CLASS[kind]}" aria-hidden="true">${kind === 'designed' ? icon('check') : kind === 'none' ? '–' : ''}</span>`;
const LEGEND = {
  designed: 'Designed for this role: the program lists it as one of its career paths',
  related: 'Builds related skills: the program teaches skills related to this role, but is aimed at other roles',
  none: 'Not a focus of the program',
};

const matrix = () => html`
<section class="sec tinted" id="programs-and-roles" aria-labelledby="cr-map-title">
  <div class="wrap">
    ${head({ id: 'cr-map-title', eyebrow: 'Programs and roles', title: 'Which programs lead *where*',
      lede: 'Rows are Nuvora programs and columns are roles. Each cell shows whether the program is designed for that role, builds related skills, or does not focus on it.',
      action: html`<a class="link cr-act" href="/programs/#compare">Compare programs ${icon('arrow')}</a>` })}
    <ul class="cr-legend" aria-label="Key to the table">
      ${['designed', 'related', 'none'].map((k) => html`<li>${mark(k)}<span>${LEGEND[k]}</span></li>`)}
    </ul>
    <p class="cr-swipe">Scroll the table sideways to see all ${ROLE_IDS.length} roles.</p>
    <div class="tablewrap cr-matrix" tabindex="0" role="region" aria-labelledby="cr-map-title">
      <table>
        <caption class="sr-only">Nuvora programs in rows, career roles in columns, and how each program relates to each role</caption>
        <thead><tr><th scope="col">Program</th>${ROLE_IDS.map((rid) => html`<th scope="col"><a href="${roleUrl(rid)}">${ROLES[rid].title}</a></th>`)}</tr></thead>
        <tbody>${PROGRAMS.map((p) => html`
          <tr><th scope="row"><a href="${p.url}">${p.short}</a><span class="cr-lvl">${p.levelLabel}</span></th>${ROLE_IDS.map((rid) => {
            const kind = relation(p, rid) || 'none';
            return html`<td class="cr-c-${kind}">${mark(kind)}<span class="sr-only">${RELATION[kind]}</span></td>`;
          })}</tr>`)}</tbody>
      </table>
    </div>
    <p class="note cr-mapnote">“Designed for” means the program lists the role among its career paths. Each role page shows exactly which of the role’s skills each program teaches. Neither is a promise of a job: see <a href="#about-these-paths">about these career paths</a> below.</p>
  </div>
</section>`;

const honest = () => html`
<section class="sec tight" id="about-these-paths" aria-labelledby="cr-note-title">
  <div class="wrap">
    <div class="cr-honest">
      <span class="cr-hico">${icon('info')}</span>
      <div>
        <h2 id="cr-note-title">${accent('About these *career paths*')}</h2>
        <p>${CAREER_NOTE}</p>
        <p>Nuvora is pre-launch, so there are no graduates, job placements or salary figures to show you, and we do not use any. Programs lead to a ${CREDENTIAL.short}, not an accredited degree. After each batch finishes we will publish completion and pass rates, with how they were measured. <a href="/about/#outcomes">How we will report results</a></p>
      </div>
    </div>
  </div>
</section>`;

const indexBody = () => html`
${pageHead({
  eyebrow: 'Careers',
  title: accent('Career paths and the *skills* they need'),
  lede: `${ROLE_IDS.length} data and AI roles, the skills each one uses and the Nuvora lessons that teach them. See how roles typically build on each other, then filter them by the program you are considering.`,
  crumbs: [['/', 'Home'], ['/careers/', 'Careers']],
  extra: html`<nav class="cr-jump" aria-label="On this page">
    <a href="#tracks">${icon('ladder')}<b>${TRACK_IDS.length}</b> career tracks</a>
    <a href="#roles">${icon('target')}<b>${ROLE_IDS.length}</b> roles</a>
    <a href="#programs-and-roles">${icon('route')}Which programs lead where</a>
  </nav>`,
})}
${intro()}
${tracksSection()}
${explorer()}
${matrix()}
${honest()}
${ctaBand()}`;

// =====================================================================================================
// /careers/<role-id>/
// =====================================================================================================

function roleFaq(rid) {
  const r = ROLES[rid];
  const a = an(r.title);
  const progs = programsFor(rid);
  const m = r.skills.length;
  const designed = progs.filter((p) => relation(p, rid) === 'designed');
  const related = progs.filter((p) => relation(p, rid) === 'related');
  const counts = progs.map((p) => [p, coverage(p, rid).length]);
  const some = counts.filter(([, k]) => k > 0);
  const none = counts.filter(([, k]) => k === 0);
  const parts = [];
  if (designed.length) parts.push(`${cap(and(designed.map((p) => `the ${p.name}`)))} ${designed.length === 1 ? 'is' : 'are'} designed for this role.`);
  if (related.length) parts.push(`${cap(and(related.map((p) => `the ${p.name}`)))} also ${related.length === 1 ? 'builds' : 'build'} related skills.`);
  if (some.length) parts.push(`Of the ${m} skills on this page, ${and(some.map(([p, k]) => `the ${p.name} teaches ${k === m ? `all ${m}` : k}`))}.`);
  for (const [p] of none) {
    const near = sameSubject(p, rid).map(([, t]) => t);
    parts.push(near.length
      ? `The ${p.name} does not include these exact lessons; it teaches related ones: ${and(near)}.`
      : `The ${p.name} does not teach these exact lessons.`);
  }
  parts.push('If you are unsure, Find my program suggests one from your background, goal and weekly time.');
  return [
    [`What does ${a} ${r.title} do?`, `${r.summary} Common tools in the role include ${and(r.tools)}.`],
    [`Which Nuvora program prepares me for ${a} ${r.title} role?`, parts.join(' ')],
    [`Does Nuvora guarantee a job as ${a} ${r.title}?`,
      `No. Nuvora programs teach skills this role uses and lead to a ${CREDENTIAL.short}, not an accredited degree. Nuvora is pre-launch, so there are no graduates or job outcomes yet. The career tracks on this page are ${CAREER_NOTE.charAt(0).toLowerCase() + CAREER_NOTE.slice(1)}`],
  ];
}

function skillItem(rid, [skill, code], i) {
  const where = whereTaught(rid, code);
  const lesson = where[0]?.lesson;
  return html`
<li class="cr-skill${where.length ? '' : ' cr-untaught'}">
  <div class="cr-skmain">
    <span class="cr-skn" aria-hidden="true">${i + 1}</span>
    <div>
      <h3>${skill}</h3>
      ${lesson
        ? html`<p class="cr-lesson"><span class="mono">${code}</span> Nuvora lesson: ${lesson}</p>`
        : html`<p class="cr-lesson">Not taught in a Nuvora program yet.</p>`}
    </div>
  </div>
  ${where.length ? html`
  <div class="cr-where">
    <span class="cr-k">Where Nuvora teaches it</span>
    <ul>${where.map((w) => html`<li><a href="${w.p.url}#curriculum"><b>${w.p.name}</b><span>term ${w.n}: ${w.termTitle}</span></a></li>`)}</ul>
  </div>` : ''}
</li>`;
}

function trackCard(rid, tid) {
  const t = TRACKS[tid];
  const at = t.steps.indexOf(rid);
  const tag = (n) => (n === at ? 'This role' : n === at - 1 ? 'Previous step' : n === at + 1 ? 'Next step' : `Step ${n + 1}`);
  return html`
<article class="cr-path" aria-labelledby="cr-p-${tid}">
  <div>
    <h3 id="cr-p-${tid}">${t.title}</h3>
    <p class="cr-pos">Step ${at + 1} of ${t.steps.length}${at === 0 ? ' · the first step in this track' : at === t.steps.length - 1 ? ' · the last step in this track' : ''}</p>
  </div>
  <ol class="cr-tl">
    ${t.steps.map((sid, n) => {
      const cls = n === at ? 'cr-now' : Math.abs(n - at) === 1 ? 'cr-adj' : '';
      return n === at
        ? html`<li class="${cls}" aria-current="step"><span class="cr-dot" aria-hidden="true">${n + 1}</span><span class="cr-here"><span class="cr-tag">${tag(n)}</span><b>${stepLabel(tid, n)}</b></span></li>`
        : html`<li class="${cls}"><span class="cr-dot" aria-hidden="true">${n + 1}</span><a href="${roleUrl(sid)}"><span class="cr-tag">${tag(n)}</span><b>${stepLabel(tid, n)}</b></a></li>`;
    })}
  </ol>
</article>`;
}

function programItem(p, rid) {
  const m = ROLES[rid].skills.length;
  const cov = coverage(p, rid);
  const kind = relation(p, rid) || 'related';
  const near = cov.length ? [] : sameSubject(p, rid);
  const what = cov.length === m ? html`teaches all ${m} skills above`
    : cov.length ? html`teaches ${cov.length} of the ${m} skills above: <span class="mono">${cov.map(([, c]) => c).join(', ')}</span>`
      : near.length ? html`teaches related lessons: ${near.map(([c, t], i) => html`${i ? '; ' : ''}<span class="mono">${c}</span> ${t}`)}`
        : 'does not teach the exact lessons above';
  return html`
<div class="cr-pc">
  <p class="cr-cover cr-cover-${kind}">${icon(kind === 'designed' ? 'target' : 'layers')}<span><b>${RELATION[kind]}</b> · ${what}</span></p>
  ${programCard(p)}
</div>`;
}

function roleBody(rid) {
  const r = ROLES[rid];
  const a = an(r.title);
  const url = roleUrl(rid);
  const progs = programsFor(rid);
  const tracks = tracksFor(rid);
  const m = r.skills.length;
  const taught = r.skills.filter(([, code]) => TAUGHT.has(code)).length;
  return html`
${pageHead({
  eyebrow: 'Career path',
  title: accent(`${r.title}: *skills and learning path*`),
  lede: `What ${a} ${r.title} does, the skills the role uses and where Nuvora teaches each one, and where the role sits in typical career tracks.`,
  crumbs: [['/', 'Home'], ['/careers/', 'Careers'], [url, r.title]],
  extra: html`
    <div class="cr-chips">
      <span class="chip frost">${icon('target')} ${plural(m, 'skill')}</span>
      <span class="chip frost">${icon('route')} In ${plural(tracks.length, 'career track')}</span>
      <span class="chip frost">${icon('book')} ${plural(progs.length, 'Nuvora program')}</span>
    </div>
    <div class="cr-heroacts">
      <a class="btn gold" href="#programs" data-cta="role-programs">Programs for this role ${icon('arrow')}</a>
      <a class="btn ghost" href="/find-your-program/" data-cta="role-find">Find my program</a>
    </div>`,
})}

<section class="sec" id="about-role" aria-labelledby="cr-does-title">
  <div class="wrap cr-about">
    <div class="stack">
      <span class="eyebrow">The role</span>
      <h2 id="cr-does-title">${accent(`What ${a} ${r.title} *does*`)}</h2>
      <p class="lede cr-summary">${r.summary}</p>
      <div class="cr-tools">
        <h3>Common tools in this role</h3>
        <ul class="cr-toollist">${r.tools.map((t) => html`<li class="chip blue">${t}</li>`)}</ul>
      </div>
    </div>
    <aside class="box cr-glance" aria-labelledby="cr-glance-title">
      <h3 id="cr-glance-title">${icon('info')} At a glance</h3>
      <dl class="kv">
        <div><dt>Skills</dt><dd>${m} listed below, ${taught === m ? 'each' : `${taught} of them`} mapped to a Nuvora lesson</dd></div>
        <div><dt>Career tracks</dt><dd>${tracks.map((tid, i) => html`${i ? html`<br>` : ''}${TRACKS[tid].title} <span class="muted small">(step ${TRACKS[tid].steps.indexOf(rid) + 1} of ${TRACKS[tid].steps.length})</span>`)}</dd></div>
        <div><dt>Programs</dt><dd><ul class="cr-glist">${progs.map((p) => html`<li><a href="${p.url}">${p.name}</a></li>`)}</ul></dd></div>
        <div><dt>Credential</dt><dd>${CREDENTIAL.short}, not an accredited degree</dd></div>
      </dl>
    </aside>
  </div>
</section>

<section class="sec tinted" id="skills" aria-labelledby="cr-skills-title">
  <div class="wrap">
    ${head({ id: 'cr-skills-title', eyebrow: 'Skills', title: 'Skills this role *uses*',
      lede: 'Each skill maps to a Nuvora lesson. Below it is every program term that teaches the lesson, linked to that program’s curriculum.' })}
    <ol class="cr-skilllist">${r.skills.map((s, i) => skillItem(rid, s, i))}</ol>
  </div>
</section>

<section class="sec dark on-dark" id="paths" aria-labelledby="cr-paths-title">
  <div class="wrap">
    ${head({ id: 'cr-paths-title', eyebrow: html`${icon('ladder')} Career tracks`, title: 'Where this role *sits*',
      lede: `${a === 'an' ? 'An' : 'A'} ${r.title} appears in ${plural(tracks.length, 'track')}. Open the step before or after it to compare the skills.`,
      action: html`<a class="link cr-act" href="/careers/#tracks">All career tracks ${icon('arrow')}</a>` })}
    <div class="cr-paths">${tracks.map((tid) => trackCard(rid, tid))}</div>
    <p class="note cr-pathnote">${CAREER_NOTE}</p>
  </div>
</section>

<section class="sec" id="programs" aria-labelledby="cr-progs-title">
  <div class="wrap">
    ${head({ id: 'cr-progs-title', eyebrow: 'Programs', title: 'Programs for this *role*',
      lede: `Programs designed for this role, and programs that build related skills. Above each card: which of the ${m} skills on this page it teaches.`,
      action: html`<a class="link cr-act" href="/programs/#compare">Compare all programs ${icon('arrow')}</a>` })}
    <div class="cr-pcs">${progs.map((p) => programItem(p, rid))}</div>
  </div>
</section>

<section class="sec tinted" id="faq" aria-labelledby="cr-faq-title">
  <div class="wrap">
    ${head({ id: 'cr-faq-title', eyebrow: 'Questions', title: `About the *${r.title}* role` })}
    ${faqList(roleFaq(rid))}
  </div>
</section>
${ctaBand({ title: `Build the skills ${a} *${r.title}* uses` })}`;
}

export default function careers({ today } = {}) {
  const index = {
    path: '/careers/',
    html: page({
      path: '/careers/', today,
      title: 'Career paths and the skills they need',
      description: `${ROLE_IDS.length} data and AI roles, from ${ROLES[ROLE_IDS[0]].title} to ${ROLES['ai-product-lead'].title}: the skills each uses, the Nuvora lessons that teach them and which programs lead where.`,
      body: indexBody(),
      schema: [breadcrumbList([['/', 'Home'], ['/careers/', 'Careers']]), itemList(ROLE_IDS.map((rid) => [roleUrl(rid), ROLES[rid].title]))],
      scripts: ['/js/careers.js'],
      styles: ['/css/careers.css'],
    }),
  };
  const roles = ROLE_IDS.map((rid) => {
    const r = ROLES[rid];
    const url = roleUrl(rid);
    return {
      path: url,
      html: page({
        path: url, today,
        title: `${r.title}: skills and learning path`,
        description: `What ${an(r.title)} ${r.title} does, the ${r.skills.length} skills the role uses, the Nuvora lessons and terms that teach each one, and the programs that cover them.`,
        body: roleBody(rid),
        schema: [breadcrumbList([['/', 'Home'], ['/careers/', 'Careers'], [url, r.title]]), faqPage(roleFaq(rid))],
        styles: ['/css/careers.css'],
      }),
    };
  });
  return [index, ...roles];
}

// Lesson codes named in ROLES that no program teaches (reported by the build check, shown without links).
export const untaughtSkills = () => ROLE_IDS.flatMap((rid) => ROLES[rid].skills.filter(([, code]) => !TAUGHT.has(code)).map(([skill, code]) => ({ role: rid, skill, code })));
