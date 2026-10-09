// Tuition (/tuition/): launch pricing per level and per program, the application fee, paying one term at a time,
// what tuition includes, financing, currency, taxes and the refund and deferral policy. Every price comes from
// TUITION and PROGRAMS; nothing that the owner has not decided (refunds, financing) is described as if it were.
// The access rule for unpaid terms is the owner's public wording, shared with the other pages (access-rule.mjs).
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { faqList, ctaBand } from '../lib/components.mjs';
import { breadcrumbList, faqPage } from '../lib/schema.mjs';
import { PROGRAMS, LEVELS, TUITION, CREDENTIAL, money } from '../data/programs.mjs';
import { SCHEDULE, OWNER } from '../data/site.mjs';
import { ACCESS_RULE } from '../assets/js/access-rule.mjs';

const PATH = '/tuition/';
const CRUMBS = [['/', 'Home'], [PATH, 'Tuition']];
const WEEKS = SCHEDULE.weeks;
const FEE = money(TUITION.applicationFee);
const CURRENCY = TUITION.currency === 'USD' ? 'US dollars (USD)' : TUITION.currency;
const CURRENCY_SHORT = TUITION.currency === 'USD' ? 'US dollars' : TUITION.currency;
const LATER = 'will be published before the first batch';

const span = (nums, fmt = String) => {
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const termsText = (n) => plural(n, 'term', 'terms');

// One entry per level, built from the programs at that level.
const LEVEL_TITLES = { Certificate: 'Certificates', Bachelor: 'Bachelor’s-level programs', Master: 'Master’s-level programs' };
const LEVEL_NOTE = { Master: 'Needs a bachelor’s degree in any field' };
const BY_LEVEL = LEVELS.map(([lvl]) => {
  const programs = PROGRAMS.filter((p) => p.level === lvl);
  return {
    lvl, title: LEVEL_TITLES[lvl] ?? lvl, programs, perTerm: TUITION.perTerm[lvl],
    terms: span(programs.map((p) => p.termCount)), termCounts: programs.map((p) => p.termCount),
    total: span(programs.map((p) => p.tuition.total), money),
    duration: [...new Set(programs.map((p) => p.duration))].join(' or '),
    colors: programs[0]?.colors ?? ['#0082FB', '#0866FF'],
  };
}).filter((l) => l.programs.length);

const prices = [...new Set(Object.values(TUITION.perTerm))].sort((a, b) => a - b);
const PRICE_RANGE = span(prices, money);
const LOWEST = money(prices[0]);
const MAX_TERMS = Math.max(...PROGRAMS.map((p) => p.termCount));
const PROJECTS = PROGRAMS[0].terms[0].projects.length;
const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

// "$1,950 per term for certificates and bachelor’s-level programs, $2,450 per term for master’s-level programs"
const LEVEL_PLURAL = { Certificate: 'certificates', Bachelor: 'bachelor’s-level programs', Master: 'master’s-level programs' };
const priceLine = () => {
  const byPrice = new Map();
  for (const { lvl, perTerm } of BY_LEVEL) byPrice.set(perTerm, [...(byPrice.get(perTerm) ?? []), LEVEL_PLURAL[lvl]]);
  return [...byPrice].map(([price, names]) => `${money(price)} per term for ${names.join(' and ')}`).join(', ');
};

const refundText = () => (OWNER.refundPolicy
  ? 'The refund and deferral policy is published, and you see it before you pay.'
  : `The refund and deferral policy ${LATER}, and you will see it before you pay.`);

const SECTIONS = [['levels', 'By level'], ['programs', 'By program'], ['included', 'What is included'], ['paying', 'Paying'],
  ['refunds', 'Refunds'], ['faq', 'FAQ']];

const FAQ = [
  ['How much does a whole program cost?',
    `Multiply the price per term by the number of terms, then add the one-time ${FEE} application fee. ${PROGRAMS.map((p) => `${p.name}: ${termsText(p.termCount)}, ${money(p.tuition.total)} in tuition`).join('. ')}.`],
  ['Do I pay for the whole program up front?',
    `No. You pay tuition one ${WEEKS}-week term at a time, so you never pay for more than one term in advance.`],
  ['What happens if a term isn’t paid?',
    ACCESS_RULE],
  ['What is the application fee?',
    `A one-time ${FEE} fee, paid once when you apply. It is not charged again for later terms.`],
  ['Does requesting a seat cost anything?',
    `No. A seat request is free and is not an application. The ${FEE} application fee and your first term’s tuition are paid later, when you apply and enrol.`],
  ['Can I pay in instalments, take a loan or get a scholarship?',
    'Not yet. Nuvora does not offer loans, instalments within a term or scholarships at the moment. Paying one term at a time is the way to spread the cost.'],
  ['Which currency are the prices in?',
    `${CURRENCY_SHORT[0].toUpperCase()}${CURRENCY_SHORT.slice(1)}. These are launch prices.`],
  ['Do prices include tax?',
    'Whether taxes apply depends on where you live. The exact amount you pay, including any tax, is shown before you pay.'],
  ['What is the refund and deferral policy?',
    refundText()],
  ['What does tuition pay for?',
    `Your lessons, two live Jitsi sessions a week and their recordings, PDF notes and project briefs, instructor grading with written feedback, the student portal, and a ${CREDENTIAL.short} when you complete your program.`],
];

// ---------- price per level ----------
const levels = () => html`
<section class="sec" id="levels" aria-labelledby="levels-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('coin')} Launch pricing</span><h2 id="levels-title">${accent('Tuition by *level*')}</h2>
      <p class="lede">One price per ${WEEKS}-week term for each level: every program at a level has the same price per term.</p></div></div>
    <ul class="how-levels">
      ${BY_LEVEL.map((l) => html`
      <li class="how-level" style="--a:${l.colors[0]};--b:${l.colors[1]}">
        <h3>${l.title}</h3>
        ${LEVEL_NOTE[l.lvl] ? html`<p class="how-lvl-sub">${LEVEL_NOTE[l.lvl]}</p>` : html`<p class="how-lvl-sub">No degree needed</p>`}
        <p class="how-price"><b>${money(l.perTerm)}</b><span>per ${WEEKS}-week term</span></p>
        <dl class="how-lfacts">
          <div><dt>Terms</dt><dd>${l.terms}</dd></div>
          <div><dt>Length</dt><dd>${l.duration}</dd></div>
          <div><dt>Tuition for the program</dt><dd>${l.total}</dd></div>
          <div><dt>Application fee</dt><dd>${FEE}, once</dd></div>
        </dl>
        <div>
          <span class="how-lbl">${plural(l.programs.length, 'program', 'programs')}</span>
          <ul class="how-lprogs">${l.programs.map((p) => html`<li><a href="${p.url}">${p.name}${icon('arrow')}</a></li>`)}</ul>
        </div>
      </li>`)}
    </ul>
  </div>
</section>`;

// ---------- per program ----------
const programs = () => html`
<section class="sec tinted" id="programs" aria-labelledby="programs-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('layers')} Every program</span><h2 id="programs-title">${accent('What each program *costs*')}</h2>
      <p class="lede">Tuition per term, the number of terms and the total, with and without the one-time ${FEE} application fee.</p></div>
      <a class="link" href="/programs/#compare">Compare programs ${icon('arrow')}</a></div>
    <div class="tablewrap how-ptable">
      <table>
        <caption class="sr-only">Tuition for each Nuvora program, in ${CURRENCY}</caption>
        <thead><tr><th scope="col">Program</th><th scope="col">Per term</th><th scope="col">Terms</th><th scope="col">Tuition total</th><th scope="col">With application fee</th></tr></thead>
        <tbody>
          ${PROGRAMS.map((p) => html`<tr>
            <th scope="row"><a href="${p.url}">${p.name}</a><span class="how-pmeta">${p.levelLabel} · ${p.duration}</span></th>
            <td data-label="Per term">${money(p.tuition.perTerm)}</td>
            <td data-label="Terms">${termsText(p.termCount)} of ${WEEKS} weeks</td>
            <td data-label="Tuition total" class="how-tot">${money(p.tuition.total)}</td>
            <td data-label="With application fee">${money(p.tuition.total + TUITION.applicationFee)}</td>
          </tr>`)}
        </tbody>
        <tfoot><tr><td colspan="5">Launch pricing in ${CURRENCY}. Tuition is paid one term at a time; the ${FEE} application fee is paid once. Totals are the price per term multiplied by the number of terms.</td></tr></tfoot>
      </table>
    </div>
  </div>
</section>`;

// ---------- what tuition includes ----------
const INCLUDED = [
  ['play', 'Lessons', 'Every lesson of your term, streamed in the student portal. Lessons can be watched any time but never downloaded.'],
  ['live', 'Live sessions and recordings', `A ${SCHEDULE.classMinutes}-minute class every ${SCHEDULE.classDay} and ${SCHEDULE.officeMinutes}-minute office hours every ${SCHEDULE.officeDay} on Jitsi, recorded for the portal.`],
  ['doc', 'PDF notes and briefs', 'Lesson notes, exercise sheets and project briefs as PDFs you can download and keep.'],
  ['folder', 'Grading and feedback', `${NUM[PROJECTS] ?? PROJECTS} projects a term, graded by an instructor on a four-level rubric, with written feedback and resubmission.`],
  ['layers', 'The student portal', 'Your learning path, progress, live session links, recordings, assignments and notifications in one place.'],
  ['cert', 'Certificate of completion', `A ${CREDENTIAL.short} when you complete your program. It is not an accredited degree.`],
];

const included = () => html`
<section class="sec" id="included" aria-labelledby="incl-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('check')} Included</span><h2 id="incl-title">${accent('What your tuition *covers*')}</h2>
      <p class="lede">Every term’s tuition includes the same things, whichever program you take.</p></div>
      <a class="link" href="/how-it-works/">How a term works ${icon('arrow')}</a></div>
    <ul class="how-incl">
      ${INCLUDED.map(([ic, t, d]) => html`<li><span class="how-fi">${icon(ic)}</span><div><h3>${t}</h3><p>${d}</p></div></li>`)}
    </ul>
  </div>
</section>`;

// ---------- paying ----------
const paying = () => html`
<section class="sec tinted" id="paying" aria-labelledby="pay-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('card')} Paying</span><h2 id="pay-title">${accent('Pay one term *at a time*')}</h2>
      <p class="lede">You never pay for a whole program up front. You pay the application fee once, then tuition for one ${WEEKS}-week term at a time.</p></div></div>
    <div class="twocol how-two how-pay">
      <div class="box"><h3>${icon('cal')} One term at a time</h3>
        <p>Pay the one-time <b>${FEE} application fee</b> when you apply, then tuition for <b>one ${WEEKS}-week term at a time</b>. Even a ${MAX_TERMS}-term program is paid as ${MAX_TERMS} separate terms, not one large bill.</p></div>
      <div class="box"><h3>${icon('info')} Financing</h3>
        <p>These are not offered yet:</p>
        <ul class="how-not">
          <li>${icon('x')}<span>Loans</span></li>
          <li>${icon('x')}<span>Instalments within a term</span></li>
          <li>${icon('x')}<span>Scholarships</span></li>
        </ul></div>
      <div class="box"><h3>${icon('globe')} Currency</h3>
        <p>Prices are <b>launch pricing in ${CURRENCY}</b>.</p></div>
      <div class="box"><h3>${icon('doc')} Taxes</h3>
        <p>Whether taxes apply <b>depends on where you live</b>. The exact amount, including any tax, is shown before you pay.</p></div>
    </div>
    <div class="how-access" id="access">
      ${icon('pause')}
      <div><h3>If a term isn’t paid</h3><p>${ACCESS_RULE}</p></div>
    </div>
  </div>
</section>`;

// ---------- refunds ----------
const refunds = () => html`
<section class="sec" id="refunds" aria-labelledby="refunds-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('info')} Before you pay</span><h2 id="refunds-title">${accent('Refunds and *deferrals*')}</h2></div></div>
    <div class="how-refund">
      ${icon('shield')}
      <div>
        <p><b>${refundText()}</b></p>
        <p>A question about refunds or deferrals in the meantime? See the <a href="/contact/">contact page</a>.</p>
      </div>
    </div>
  </div>
</section>`;

const body = () => html`
${pageHead({
    eyebrow: 'Tuition',
    title: accent('Tuition, *plainly*'),
    lede: `Launch pricing in ${CURRENCY_SHORT}: ${priceLine()}, plus a one-time ${FEE} application fee. You pay one term at a time.`,
    crumbs: CRUMBS,
    extra: html`<div class="row how-chips">
      <span class="chip frost">${icon('coin')} From ${LOWEST} per term</span>
      <span class="chip frost">${icon('cal')} Pay one term at a time</span>
      <span class="chip frost">${icon('doc')} ${FEE} application fee, once</span></div>`,
  })}
<div class="how-page">
  <div class="jumpnav how-jump"><div class="wrap"><nav aria-label="On this page" data-jumpnav>${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav></div></div>
  ${levels()}
  ${programs()}
  ${included()}
  ${paying()}
  ${refunds()}
  <section class="sec tinted" id="faq" aria-labelledby="faq-title"><div class="wrap">
    <div class="shead"><div><span class="eyebrow">Questions</span><h2 id="faq-title">${accent('Tuition, *answered*')}</h2></div></div>
    ${faqList(FAQ)}
  </div></section>
</div>
${ctaBand()}`;

export default function tuition({ today } = {}) {
  return [{
    path: PATH,
    html: page({
      path: PATH, today,
      title: 'Tuition and fees: launch pricing per term',
      description: `Nuvora tuition is ${PRICE_RANGE} per ${WEEKS}-week term in ${CURRENCY_SHORT}, paid one term at a time, plus a one-time ${FEE} application fee. See every program’s total.`,
      body: body(),
      schema: [breadcrumbList(CRUMBS), faqPage(FAQ)],
      scripts: ['/js/how.js'],
      styles: ['/css/how.css'],
    }),
  }];
}
