// /contact/: the channels that work today (the seat request form before launch, the student portal after
// enrolment) and the owner's contact facts from OWNER. Undecided facts are null and render as "to be published
// before the first batch": no contact detail is ever invented here.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead, liveDate } from '../lib/layout.mjs';
import { sectionHead } from '../lib/components.mjs';
import { breadcrumbList } from '../lib/schema.mjs';
import { SCHEDULE, OWNER } from '../data/site.mjs';

const PATH = '/contact/';
const CRUMBS = [['/', 'Home'], [PATH, 'Contact']];
const LATER = 'To be published before the first batch';

const later = () => html`<span class="abt-tbp">${icon('clock')} ${LATER}</span>`;
const text = (v) => (typeof v === 'string' ? v : [v.name, v.email, v.phone].filter(Boolean).join(' Â· '));

// Each row: icon, label, the OWNER value as markup (or null), and what to do until it is published.
const DETAILS = [
  ['mail', 'Support email', OWNER.supportEmail && html`<a href="mailto:${OWNER.supportEmail}">${OWNER.supportEmail}</a>`,
    html`Until then, use the <a href="/admissions/#request">seat request form</a> and we reply by email.`],
  ['chat', 'Phone or WhatsApp', OWNER.phone && html`<a href="tel:${OWNER.phone.replace(/[^\d+]/g, '')}">${OWNER.phone}</a>`,
    'A phone or WhatsApp number, if there is one, will be published here before the first batch.'],
  ['clock', 'Support hours', OWNER.supportHours && html`<span>${OWNER.supportHours}</span>`,
    'Support hours and reply times will be listed here.'],
  ['brief', 'Registered legal entity', OWNER.legalEntity && html`<span>${OWNER.legalEntity}</span>`,
    'The name of the company that runs Nuvora will be listed here.'],
  ['globe', 'Registered address', OWNER.address && html`<span>${OWNER.address}</span>`,
    'The registered address will be listed here.'],
  ['shield', 'Grievance officer', OWNER.grievanceOfficer && html`<span>${text(OWNER.grievanceOfficer)}</span>`,
    'The person who handles complaints, and how to reach them, will be listed here.'],
];

const channels = () => html`
<section class="sec" id="channels">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Channels', title: 'Two ways to *reach us* today', lede: 'Nuvora is preparing its first batch, so there are two channels: one for people thinking of joining, and one for enrolled students.' })}
    <div class="abt-channels">
      <article class="abt-ch main on-dark" aria-labelledby="ch-seat">
        <span class="abt-ico">${icon('mail')}</span>
        <h3 id="ch-seat">Before you join: request a seat</h3>
        <p>The seat request form is how to reach us before launch. Choose a program and a start date, and we reply by email to the address you give.</p>
        <ul>
          <li>It is not an application or a payment, and nothing is charged.</li>
          <li>We use your details only to reply about your request.</li>
          <li>If you saved a plan in Find my program, you choose whether to include it.</li>
        </ul>
        <p class="abt-when">Next start ${liveDate('start', 0)} Â· seat requests close ${liveDate('applyBy', 0)}</p>
        <div class="row"><a class="btn gold" href="/admissions/#request" data-cta="contact-request">Request a seat ${icon('arrow')}</a></div>
      </article>
      <article class="abt-ch" aria-labelledby="ch-portal">
        <span class="abt-ico">${icon('cap')}</span>
        <h3 id="ch-portal">Current students: the student portal</h3>
        <p>Once you are enrolled, your course runs in the portal: lessons, PDF materials, live session links, project submissions, grades and written feedback, and notifications.</p>
        <p>For questions about your coursework, ask in the live class on ${SCHEDULE.classDay}s or at office hours on ${SCHEDULE.officeDay}s, both at ${SCHEDULE.classTime} US time on Jitsi.</p>
        <div class="row"><a class="btn ghost" href="/portal/">Student login ${icon('arrow')}</a></div>
      </article>
      <div class="abt-quick">
        <span class="abt-ico">${icon('book')}</span>
        <div><h3>A quick question about programs?</h3>
          <p>Prices, start dates, weekly hours and the credentialâ€™s limits are already published, and the advisor answers from the same published catalog.</p></div>
        <div class="row">
          <button class="btn ghost" type="button" data-advisor-open hidden>${icon('spark')} Ask a question</button>
          <a class="btn ghost" href="/how-it-works/">How it works</a>
        </div>
      </div>
    </div>
  </div>
</section>`;

const details = () => html`
<section class="sec tinted" id="details">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Contact details', title: 'Company and support *details*', lede: 'These details will be published here before the first batch. Until a detail appears on this page, it has not been published, and we will not guess at it.' })}
    <dl class="abt-details">${DETAILS.map(([ic, label, value, until]) => html`
      <div><dt>${icon(ic)}${label}</dt><dd>${value || html`${later()}<span class="small">${until}</span>`}</dd></div>`)}</dl>
    <p class="abt-caution" role="note">${icon('info')}<span>Until a detail appears on this page, any email address, phone number or social media account that claims to be Nuvora is not one we have published. Please do not send it payments or personal documents.</span></p>
    <div class="abt-links" style="margin-top:22px">
      <a class="link" href="/legal/privacy/">Privacy notice ${icon('arrow')}</a>
      <a class="link" href="/legal/terms/">Terms of use ${icon('arrow')}</a>
      <a class="link" href="/legal/accessibility/">Accessibility statement ${icon('arrow')}</a>
      <a class="link" href="/about/">About Nuvora ${icon('arrow')}</a>
    </div>
  </div>
</section>`;

const body = () => html`
${pageHead({
  eyebrow: 'Contact',
  title: accent('How to *reach us*'),
  lede: 'Before launch, the seat request form is how to reach us, and we reply by email. Enrolled students use the student portal. Here is what works today, and what is still to be published.',
  crumbs: CRUMBS,
})}
${channels()}
${details()}`;

export default function contact({ today } = {}) {
  return [{
    path: PATH,
    html: page({
      path: PATH, today,
      title: 'Contact Nuvora: seat requests and student support',
      description: 'How to reach Nuvora before launch: send a seat request and we reply by email. Enrolled students use the portal. Other details come before the first batch.',
      body: body(),
      schema: [breadcrumbList(CRUMBS)],
      styles: ['/css/about.css'],
    }),
  }];
}
