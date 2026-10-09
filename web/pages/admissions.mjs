// /admissions/: how joining works before launch, who can join, the next start dates and the seat request form.
// The form is sent by web/assets/js/lead.js to the request_seat database function. Without JavaScript the submit
// button stays disabled, so personal details can never end up in a URL or be posted anywhere else. Every accepted
// request gets the same message, so the page never reveals whether the same request was sent before.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead, liveDate } from '../lib/layout.mjs';
import { faqList, ctaBand } from '../lib/components.mjs';
import { breadcrumbList, faqPage } from '../lib/schema.mjs';
import { PROGRAMS, LEVELS, TUITION, CREDENTIAL, money, nextStarts, termDates, fmtDay, fmtLong, isoDay } from '../data/programs.mjs';
import { OWNER } from '../data/site.mjs';
import { ACCESS_RULE } from '../assets/js/access-rule.mjs';

const PATH = '/admissions/';
const CRUMBS = [['/', 'Home'], [PATH, 'Admissions']];
const FORM_STARTS = 3;   // the form offers the next three starts
const TABLE_STARTS = 6;  // the table lists the next six
const LATER = 'to be published before the first batch';
const FEE = money(TUITION.applicationFee);

// "$1,950 per term for certificates and bachelorâ€™s-level programs, $2,450 per term for masterâ€™s-level programs"
const LEVEL_PLURAL = { Certificate: 'certificates', Bachelor: 'bachelorâ€™s-level programs', Master: 'masterâ€™s-level programs' };
const priceLine = () => {
  const byPrice = new Map();
  for (const [lvl] of LEVELS) byPrice.set(TUITION.perTerm[lvl], [...(byPrice.get(TUITION.perTerm[lvl]) ?? []), LEVEL_PLURAL[lvl]]);
  return [...byPrice].map(([price, names]) => `${money(price)} per term for ${names.join(' and ')}`).join(', ');
};

// Who can join, grouped from the program data.
const GROUPS = [
  { key: 'open', ic: 'book', title: 'No degree, no coding', text: 'Start from the basics: these programs teach Python from the start.',
    test: (p) => !p.needsBachelor && !p.requiresCoding },
  { key: 'code', ic: 'layers', title: 'No degree, but you code already', text: 'No degree needed. You should already be comfortable writing code.',
    test: (p) => !p.needsBachelor && p.requiresCoding },
  { key: 'degree', ic: 'cap', title: 'A bachelorâ€™s degree in any field', text: 'Masterâ€™s-level programs need a completed bachelorâ€™s degree, plus the skills listed.',
    test: (p) => p.needsBachelor },
].map((g) => ({ ...g, programs: PROGRAMS.filter(g.test) })).filter((g) => g.programs.length);

const codingCerts = PROGRAMS.filter((p) => !p.needsBachelor && p.requiresCoding);

const FAQ = [
  ['Is requesting a seat the same as applying?',
    'No. A seat request is not an application or an admission decision. It tells Nuvora which program and start date you want. Nuvora replies by email with next steps, and the application opens later.'],
  ['Does it cost anything to request a seat?',
    `No. Nothing is charged when you request a seat. The one-time ${FEE} application fee and your first termâ€™s tuition are paid later, when enrolment opens. Tuition is ${priceLine()}, in US dollars at launch pricing, paid one term at a time.`],
  ['When will Nuvora reply?',
    `By email, to the address you give in the form. ${OWNER.supportHours ? `Support hours: ${OWNER.supportHours}.` : `Support hours and reply times are ${LATER}.`}`],
  ['Can I choose a different start date later?',
    'You can send another request for a different start date while its requests are open. Deferring after you have paid is covered by the refund and deferral policy, which will be published before the first batch, and you will see it before you pay.'],
  ['Who can join?',
    `Masterâ€™s-level programs need a bachelorâ€™s degree in any field. Certificates and bachelorâ€™s-level programs need no degree, and the beginner programs teach Python from the start.${codingCerts.length ? ` ${codingCerts.length === 1 ? 'One certificate expects' : 'Some certificates expect'} you to code already; each program lists what you need.` : ''}`],
  ['What happens to the details I send?',
    'The form sends them only to Nuvoraâ€™s database, and Nuvora uses them to reply to your request, as described in the privacy notice. If you saved a plan in Find my program, it is sent only if you tick the box to include it.'],
  ['How do I know my request arrived?',
    'The page says â€œRequest receivedâ€ as soon as Nuvoraâ€™s database accepts it, and Nuvora replies by email to the address you gave. The page shows the same message every time, so a request can only be confirmed through that email address.'],
  ['What happens if I donâ€™t pay for a term?',
    ACCESS_RULE],
  ['Will I receive a degree?',
    `No. Programs lead to a ${CREDENTIAL.short}, not an accredited degree. Nuvora credits describe workload and may not transfer to universities, and Nuvora does not accept transfer credit or offer test-outs.`],
];

const STEPS = [
  { ic: 'search', title: 'Find your program',
    text: `Compare the ${PROGRAMS.length} programs, or answer four questions in Find my program. Check what each one needs and how many hours a week it takes.`,
    links: [['/programs/', 'Compare programs'], ['/find-your-program/', 'Find my program']] },
  { ic: 'doc', title: 'Request a seat',
    text: 'Choose a program and a start date, and give your name, email and country. It is not an application and is free to request. The application fee is paid later when enrolment opens.',
    links: [['#request', 'Request a seat']] },
  { ic: 'mail', title: 'We reply by email',
    text: 'Nuvora replies by email with next steps for your program and start date. The application, the fee and first-term payment open later.' },
  { ic: 'card', when: 'When enrolment opens', title: 'Confirm and pay for your first term',
    text: `Complete the application, pay the one-time ${FEE} application fee and pay for your first term. You pay one term at a time, and you see the refund and deferral policy before you pay.`,
    links: [['/tuition/', 'Tuition']] },
];

// "Mon, Nov 2, 2026 Â· requests close Oct 26" (lead.js builds the same label in the browser)
const startLabel = ({ start, applyBy }) => `${fmtLong(start)} Â· requests close ${fmtDay(applyBy, { year: undefined })}`;

const hero = (today) => pageHead({
  eyebrow: 'Admissions',
  title: accent('Join Nuvora, *step by step*'),
  lede: 'Nuvora is preparing its first batches. Requesting a seat is free and not an application or payment: it tells us which program and start date you want, and we reply by email with next steps. The one-time application fee is paid later when enrolment opens.',
  crumbs: CRUMBS,
  extra: html`
    <div class="adm-headfacts">
      <span class="chip frost">${icon('cal')} Next start ${liveDate('start', 0, today)}</span>
      <span class="chip frost">${icon('clock')} Requests close ${liveDate('applyBy', 0, today)}</span>
      <span class="chip frost">${icon('coin')} Free to request</span>
    </div>
    <div class="row adm-headcta">
      <a class="btn gold" href="#request" data-cta="admissions-head-request">Request a seat ${icon('arrow')}</a>
      <a class="btn ghost" href="#dates">See start dates</a>
    </div>`,
});

const plainly = () => html`
<section class="sec" id="seat-request" aria-labelledby="plain-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">Before launch</span><h2 id="plain-title">${accent('What a seat request *is*, and is not')}</h2>
      <p class="lede">Nuvora has not run a batch yet, so joining starts with a simple request. Here is exactly what it does.</p></div></div>
    <div class="adm-isnot">
      <div class="adm-is">
        <h3>${icon('check')} A seat request is</h3>
        <ul>
          <li>${icon('check')}<span>A way to tell Nuvora which program and start date you want</span></li>
          <li>${icon('check')}<span>Free: nothing is charged when you request</span></li>
          <li>${icon('check')}<span>Answered by email, with the next steps for your program and start</span></li>
        </ul>
      </div>
      <div class="adm-not">
        <h3>${icon('x')} It is not</h3>
        <ul>
          <li>${icon('x')}<span>An application: that opens later</span></li>
          <li>${icon('x')}<span>An admission decision</span></li>
          <li>${icon('x')}<span>A payment to Nuvora</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>`;

const steps = () => html`
<section class="sec tinted" id="steps" aria-labelledby="steps-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">How joining works</span><h2 id="steps-title">${accent('Four steps to your *first term*')}</h2>
      <p class="lede">You only pay at the last step, once enrolment opens. Until then, nothing is charged.</p></div></div>
    <ol class="adm-steps">
      ${STEPS.map((s, i) => html`
      <li class="adm-step${s.when ? ' adm-later' : ''}">
        <div class="adm-stephead"><span class="adm-num" aria-hidden="true">${i + 1}</span><span class="adm-ico">${icon(s.ic)}</span></div>
        ${s.when && html`<span class="adm-when">${s.when}</span>`}
        <h3><span class="sr-only">Step ${i + 1}: </span>${s.title}</h3>
        <p>${s.text}</p>
        ${s.links && html`<p class="adm-steplinks">${s.links.map(([href, label]) => html`<a class="link" href="${href}">${label} ${icon('arrow')}</a>`)}</p>`}
      </li>`)}
    </ol>
    <p class="note adm-price">Tuition: ${priceLine()}, plus a one-time ${FEE} application fee. Launch pricing in US dollars, paid one term at a time. Loans and scholarships are not offered yet. <a href="/tuition/">Tuition and payment</a></p>
  </div>
</section>`;

const eligibility = () => html`
<section class="sec" id="eligibility" aria-labelledby="elig-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">Eligibility</span><h2 id="elig-title">${accent('Who can *join*')}</h2>
      <p class="lede">Only the masterâ€™s-level programs need a degree. Everything else is open to anyone who can give the weekly hours, and the beginner programs teach Python from the start.</p></div></div>
    <div class="adm-elig">
      ${GROUPS.map((g) => html`
      <div class="box adm-group adm-g-${g.key}">
        <h3>${icon(g.ic)} ${g.title}</h3>
        <p class="muted">${g.text}</p>
        <ul class="adm-plist">${g.programs.map((p) => html`
          <li><a href="${p.url}">${p.name}</a><span>${p.required.join(' Â· ')}</span><span class="adm-hours">${p.duration} Â· ${p.weeklyHours} hrs/week</span></li>`)}</ul>
      </div>`)}
    </div>
    <p class="note adm-cred">Programs lead to a ${CREDENTIAL.short}. ${CREDENTIAL.note} Nuvora does not accept transfer credit or offer test-outs: every learner completes every term.</p>
  </div>
</section>`;

function dates(today) {
  const starts = nextStarts(TABLE_STARTS, today);
  return html`
<section class="sec tinted" id="dates" aria-labelledby="dates-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">Start dates</span><h2 id="dates-title">${accent(`The next *${TABLE_STARTS === 6 ? 'six' : TABLE_STARTS}* starts`)}</h2>
      <p class="lede">Every term is a 12-week batch that starts on the first Monday of a month. Seat requests close 7 days before a start, and the closing day itself is still open. Dates are in US time.</p></div></div>
    <div class="tablewrap adm-dateswrap">
      <table class="adm-dates" data-adm-dates>
        <caption class="sr-only">The next ${TABLE_STARTS} batch start dates, when seat requests close, and when the first term ends</caption>
        <thead><tr><th scope="col">Batch starts</th><th scope="col">Seat requests close</th><th scope="col">First term ends</th><th scope="col"><span class="sr-only">Request</span></th></tr></thead>
        <tbody>${starts.map((s, n) => {
          const end = termDates(s.start, 1)[0].end;
          return html`<tr class="${n === 0 ? 'adm-nextrow' : ''}">
            <th scope="row"><span class="adm-day">Monday</span> ${liveDate('start', n, today)}${n === 0 ? html` <span class="chip gold adm-nextchip">Next</span>` : ''}</th>
            <td><span class="adm-cell">Requests close</span> ${liveDate('applyBy', n, today)}</td>
            <td><span class="adm-cell">First term ends</span> <time datetime="${isoDay(end)}" data-adm-end="${n}">${fmtDay(end)}</time></td>
            <td class="adm-pick">${n < FORM_STARTS
              ? html`<a class="link" href="#request" data-pick-start="${n}">Request<span class="sr-only"> a seat for the ${liveDate('start', n, today)} start</span> ${icon('arrow')}</a>`
              : html`<span class="muted small">For planning</span>`}</td>
          </tr>`;
        })}</tbody>
      </table>
    </div>
    <p class="note adm-datesnote">The form offers the next ${FORM_STARTS} starts; later dates are listed so you can plan ahead. Multi-term programs continue term after term: each program page shows the full path.</p>
  </div>
</section>`;
}

const field = ({ id, name, label, type = 'text', auto, hint, optional = false, max }) => html`
<div class="field adm-field" data-field="${name}">
  <label for="${id}">${label}${optional ? html` <span class="adm-opt">(optional)</span>` : ''}</label>
  <input id="${id}" name="${name}" type="${type}" ${auto ? html`autocomplete="${auto}"` : ''} ${optional ? '' : html`required`} maxlength="${max}" ${hint ? html`aria-describedby="${id}-hint"` : ''} ${type === 'email' ? html`spellcheck="false" autocapitalize="off"` : ''}>
  ${hint && html`<p class="hint" id="${id}-hint">${hint}</p>`}
  <p class="adm-err" id="${id}-err" hidden></p>
</div>`;

function form(today) {
  const starts = nextStarts(FORM_STARTS, today);
  return html`
<form class="adm-form" data-seat-form method="post" novalidate aria-labelledby="request-title">
  <div class="adm-summary" data-error-summary role="group" tabindex="-1" aria-labelledby="sr-summary-title" hidden>
    <h3 id="sr-summary-title" data-summary-title>Please check the form</h3>
    <p class="small" data-summary-text hidden></p>
    <ul data-summary-list></ul>
  </div>
  <p class="small muted">All fields are required unless marked optional.</p>
  <p class="adm-prefill" data-prefill-note hidden></p>
  <div class="field adm-field" data-field="program">
    <label for="sr-program">Program</label>
    <select id="sr-program" name="program" required aria-describedby="sr-program-hint">
      <option value="">Choose a program</option>
      ${LEVELS.map(([lvl, title]) => html`<optgroup label="${title}">${PROGRAMS.filter((p) => p.level === lvl).map((p) => html`<option value="${p.id}">${p.name}</option>`)}</optgroup>`)}
    </select>
    <p class="hint" id="sr-program-hint" data-program-hint>Not sure? <a href="/find-your-program/">Find my program</a> takes four questions.</p>
    <p class="adm-err" id="sr-program-err" hidden></p>
  </div>
  <div class="field adm-field" data-field="start">
    <label for="sr-start">Start date</label>
    <select id="sr-start" name="start" required aria-describedby="sr-start-hint" data-start-select>
      ${starts.map((s) => html`<option value="${isoDay(s.start)}">${startLabel(s)}</option>`)}
    </select>
    <p class="hint" id="sr-start-hint" data-start-hint>Batches start on the first Monday of a month. Dates are in US time.</p>
    <p class="adm-err" id="sr-start-err" hidden></p>
  </div>
  <div class="formgrid">
    ${field({ id: 'sr-name', name: 'full_name', label: 'Full name', auto: 'name', max: 80 })}
    ${field({ id: 'sr-email', name: 'email', label: 'Email', type: 'email', auto: 'email', max: 254, hint: 'Nuvora replies to this address.' })}
    ${field({ id: 'sr-country', name: 'country', label: 'Country you live in', auto: 'country-name', max: 56 })}
    ${field({ id: 'sr-phone', name: 'phone', label: 'Phone', type: 'tel', auto: 'tel', optional: true, max: 24, hint: 'Include your country code.' })}
  </div>
  <div class="adm-plan" data-plan-box hidden>
    <label class="check"><input type="checkbox" name="include_plan" data-include-plan aria-describedby="sr-plan-hint">
      <span>Include my saved plan. Best match: <b data-plan-name></b> <span class="adm-planmeta" data-plan-meta></span></span></label>
    <p class="hint adm-planhint" id="sr-plan-hint">If you tick this, the request also sends your Find my program answers about your background, goal, weekly time and coding, your answer about a bachelorâ€™s degree (if you gave one), and your best match and its score, so the reply can fit your plan. Nothing from the plan is sent unless you tick it.</p>
  </div>
  <div class="field adm-field" data-field="consent">
    <label class="check adm-consent"><input type="checkbox" id="sr-consent" name="consent" required>
      <span>I agree that Nuvora may store these details to reply to my request, as described in the <a href="/legal/privacy/#seat-requests" target="_blank" rel="noopener">privacy notice<span class="sr-only"> (opens in a new tab)</span></a>.</span></label>
    <p class="adm-err" id="sr-consent-err" hidden></p>
  </div>
  <div class="adm-submit">
    <button class="btn gold" type="submit" data-seat-submit disabled><span data-submit-label>Send seat request</span> ${icon('arrow')}</button>
    <p class="small muted">Not an application or payment. The one-time application fee is paid later when enrolment opens.</p>
  </div>
  <p class="adm-status" data-seat-status role="status"></p>
  <noscript><p class="adm-status is-error">This form needs JavaScript to send your request. Please turn JavaScript on for this site, then reload the page.</p></noscript>
</form>`;
}

const result = () => html`
<div class="adm-result" data-seat-result hidden>
  <span class="adm-resultic">${icon('check')}</span>
  <h3 tabindex="-1" data-result-title>Request received</h3>
  <p data-result-lede>Nuvora will reply by email to the address you gave, with next steps. The one-time application fee is charged later when enrolment opens.</p>
  <dl class="adm-ref">
    <div><dt>Program</dt><dd data-r="program"></dd></div>
    <div><dt>Start date</dt><dd data-r="start"></dd></div>
    <div><dt>Requests close</dt><dd data-r="applyBy"></dd></div>
    <div><dt>Reply to</dt><dd data-r="email"></dd></div>
  </dl>
  <h4>What happens next</h4>
  <ol class="adm-nextsteps">
    <li>Nuvora replies by email with next steps for this program and start date.</li>
    <li>When enrolment opens, you complete the application, pay the one-time ${FEE} application fee and pay for your first term.</li>
    <li>You pay one term at a time, and you see the refund and deferral policy before you pay.</li>
  </ol>
  <div class="row">
    <a class="btn primary sm" href="/programs/" data-r-link="program">View program ${icon('arrow')}</a>
    <button class="btn ghost sm" type="button" data-seat-again>Request another seat</button>
  </div>
</div>`;

const request = (today) => html`
<section class="sec dark on-dark adm-reqsec" id="request" aria-labelledby="request-title">
  <div class="wrap adm-req">
    <div class="adm-reqintro">
      <span class="eyebrow">${icon('doc')} Seat request</span>
      <h2 id="request-title">${accent('Request a *seat*')}</h2>
      <p class="lede">Tell us the program and start date you want, and Nuvora replies by email with next steps. This is not an application and is free to request. The one-time application fee is paid later when enrolment opens.</p>
      <ul class="adm-reqfacts">
        <li>${icon('doc')}<span><b>What you send:</b> the program and start date, your name, email and country, a phone number if you want to add one, and your saved Find my program plan only if you tick the box to include it.</span></li>
        <li>${icon('lock')}<span><b>Where it goes:</b> only to Nuvoraâ€™s database, so that Nuvora can reply to you.</span></li>
        <li>${icon('mail')}<span><b>What comes back:</b> â€œRequest receivedâ€ on this page, then an email from Nuvora with next steps to the address you gave.</span></li>
      </ul>
      <p class="small adm-reqmore">Questions first? <a href="/contact/">Contact Nuvora</a> or <a href="#faq">read the answers below</a>.</p>
    </div>
    <div class="adm-card">
      ${form(today)}
      ${result()}
    </div>
  </div>
</section>`;

const body = (today) => html`
${hero(today)}
${plainly()}
${steps()}
${eligibility()}
${dates(today)}
${request(today)}
<section class="sec" id="faq" aria-labelledby="faq-title"><div class="wrap">
  <div class="shead"><div><span class="eyebrow">Questions</span><h2 id="faq-title">${accent('Joining, *answered*')}</h2></div></div>
  ${faqList(FAQ)}
</div></section>
${ctaBand({ title: 'Not sure which program *fits you*?' })}`;

export default function admissions({ today } = {}) {
  return [{
    path: PATH,
    html: page({
      path: PATH, today,
      title: 'Admissions: request a seat and see start dates',
      description: 'How joining Nuvora works before launch: request a seat for a program and start date, and Nuvora replies by email with next steps. Eligibility and start dates.',
      body: body(today),
      schema: [breadcrumbList(CRUMBS), faqPage(FAQ)],
      scripts: ['/portal/config.js', '/js/lead.js'],
      styles: ['/css/admissions.css'],
    }),
  }];
}
