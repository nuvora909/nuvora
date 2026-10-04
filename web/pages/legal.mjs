// Legal pages: /legal/privacy/ and /legal/terms/ (plain-English drafts, clearly labelled, to be reviewed by counsel
// before launch), /legal/accessibility/ (the accessibility statement: target, how the site is tested, known limits)
// and /legal/credits/ (stock media and font credits). One layout: a table of contents beside the text, numbered
// sections, and links between the pages. Facts the owner has not decided come from OWNER as null and are shown as
// "to be published"; nothing here invents a contact, provider, policy or test that does not exist.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { breadcrumbList } from '../lib/schema.mjs';
import { PROGRAMS, CREDENTIAL, TUITION, money, fmtDay } from '../data/programs.mjs';
import { SITE, SCHEDULE, OWNER, PHOTOS, CLIPS } from '../data/site.mjs';
import { ACCESS_RULE } from '../assets/js/access-rule.mjs';

const LATER = 'To be published before the first batch';
const later = (label = LATER) => html`<span class="abt-tbp">${icon('clock')} ${label}</span>`;
const DRAFT_DATE = fmtDay(new Date(`${SITE.consentVersion}T00:00:00Z`), { month: 'long' });
const PROJECTS_PER_TERM = PROGRAMS[0].terms[0].projects.length;
// The day the accessibility statement was last checked against the site and its tests. Update it with the text.
const A11Y_DATE = fmtDay(new Date('2026-10-03T00:00:00Z'), { month: 'long' });
const A11Y_UPDATED = fmtDay(new Date('2026-10-04T00:00:00Z'), { month: 'long' });   // button sizes and the portal limit

const DOCS = [
  ['/legal/privacy/', 'Privacy notice', 'lock'],
  ['/legal/terms/', 'Terms of use', 'doc'],
  ['/legal/accessibility/', 'Accessibility statement', 'users'],
  ['/legal/credits/', 'Media credits', 'cert'],
];

const legalNav = (path) => html`
<nav class="abt-legalnav" aria-label="Legal pages">${DOCS.map(([href, label, ic]) => html`
  <a href="${href}" ${href === path ? html`aria-current="page"` : ''}>${icon(ic)}${label}</a>`)}
</nav>`;

const draftNote = (text) => html`
<div class="abt-draft" role="note">
  ${icon('info')}
  <div>
    <b>Draft — to be reviewed by counsel before launch</b>
    <p>${text} It is not final, and it may change after legal review.</p>
    <p class="small">Draft of ${DRAFT_DATE}</p>
  </div>
</div>`;

const contactLine = () => (OWNER.supportEmail
  ? html`Write to <a href="mailto:${OWNER.supportEmail}">${OWNER.supportEmail}</a>.`
  : html`The contact for this is ${later(LATER.toLowerCase())}.`);

// sections: [id, title, content]
function legalLayout({ path, sections, intro = '', side = '' }) {
  return html`
<section class="sec">
  <div class="wrap abt-legal">
    <div class="abt-side">
      <details class="abt-toc" open data-abt-toc>
        <summary>On this page ${icon('down')}</summary>
        <nav aria-label="On this page"><ol>${sections.map(([id, title], i) => html`
          <li><a href="#${id}"><span class="num">${i + 1}</span><span>${title}</span></a></li>`)}</ol></nav>
      </details>
      ${side && html`<p class="abt-sidenote">${side}</p>`}
    </div>
    <article class="abt-prose" aria-label="${DOCS.find(([href]) => href === path)[1]}">
      ${intro}
      ${sections.map(([id, title, content], i) => html`
      <section id="${id}" aria-labelledby="h-${id}">
        <h2 id="h-${id}"><span class="num" aria-hidden="true">${i + 1}</span><span>${title}</span></h2>
        ${content}
      </section>`)}
    </article>
  </div>
</section>`;
}

const card = (title, key, rows, note = '') => html`
<li class="abt-card">
  <div class="abt-ctop"><b>${title}</b>${key && html`<code>${key}</code>`}</div>
  ${rows.length ? html`<dl>${rows.map(([dt, dd]) => html`<div><dt>${dt}</dt><dd>${dd}</dd></div>`)}</dl>` : ''}
  ${note && html`<p>${note}</p>`}
</li>`;

// ---------------------------------------------------------------- privacy notice
const PRIVACY = [
  ['summary', 'In short', html`
    <ul class="abt-short">
      <li>${icon('check')}<span>No cookies, analytics or ad trackers on this website.</span></li>
      <li>${icon('check')}<span>Your Find my program answers stay in your browser unless you choose to send them.</span></li>
      <li>${icon('check')}<span>A seat request is used only to reply to you about that request.</span></li>
      <li>${icon('check')}<span>Your grades and progress are seen by you, your instructors and Nuvora administrators.</span></li>
      <li>${icon('info')}<span>Fonts load from Google Fonts, so Google receives your IP address and browser details.</span></li>
    </ul>`],
  ['who', 'Who this notice covers', html`
    <p>This notice covers two things run by Nuvora, a pre-launch online school for data science and AI:</p>
    <ul>
      <li><b>This website</b>, including Find my program, the advisor and the seat request form.</li>
      <li><b>The student portal</b> at <a href="/portal/">/portal/</a>, where enrolled students watch lessons, join live sessions, submit projects and see their grades.</li>
    </ul>
    <p>The legal entity responsible for your information (the data controller) and its registered address: ${OWNER.legalEntity ? html`${OWNER.legalEntity}${OWNER.address ? html`, ${OWNER.address}` : ''}` : later(LATER.toLowerCase())}.</p>`],
  ['website', 'What this website collects', html`
    <ul>
      <li><b>No cookies.</b> This website does not set cookies.</li>
      <li><b>No analytics or ad trackers.</b> We do not use analytics services, advertising tags or tracking pixels.</li>
      <li><b>Fonts from Google Fonts.</b> This website loads Plus Jakarta Sans, Source Serif 4 and Outfit from Google Fonts, and the student portal also loads JetBrains Mono from there, so Google receives your IP address and browser details when pages load. The headline font, Clash Grotesk, is served from this website.</li>
      <li><b>Hosting.</b> Like any website, the service that hosts it receives standard request details, such as your IP address and the pages you ask for. The hosting provider will be named here before launch.</li>
    </ul>
    <p>Everything else on this website runs in your browser. The only time it sends information to Nuvora is when you send a seat request.</p>`],
  ['on-device', 'What is stored on your device', html`
    <p>Some features remember things in your browser’s own storage (localStorage and sessionStorage). These are not cookies, and nothing below is sent to Nuvora automatically.</p>
    <ul class="abt-cards">
      ${card('Your saved plan', 'nuvora.plan', [
        ['Where', 'localStorage, which stays after you close the browser'],
        ['When', html`Only if you tick “Save my plan” in <a href="/find-your-program/">Find my program</a>`],
        ['What', 'Your Find my program answers and your matched program'],
        ['How long', 'Up to 90 days, after which the site no longer uses it. “Forget my plan” removes it at any time.'],
      ])}
      ${card('Your answers for this visit', 'nuvora.answers', [
        ['Where', 'sessionStorage, for this tab only'],
        ['When', 'While you answer Find my program'],
        ['What', 'Your answers, so you can move between pages without losing them'],
        ['How long', 'Until you close the tab. “Forget my plan” also removes it.'],
      ])}
      ${card('The logo intro has played', 'nuvora.intro', [
        ['Where', 'sessionStorage, for this tab only'],
        ['When', 'On the first page you open in a visit'],
        ['What', 'Only the fact that the short Nuvora logo intro has already played, so it is not shown again on every page'],
        ['How long', 'Until you close the tab'],
      ])}
      ${card('Your portal sign-in session', 'nuvora.session', [
        ['Where', 'localStorage if you tick “Keep me signed in on this device”, otherwise sessionStorage for that tab'],
        ['What', 'The sign-in session that proves who you are when the portal talks to our database provider'],
        ['How long', 'Until you sign out, or until you close the tab if you did not choose to stay signed in'],
      ], html`The portal also keeps, for the current tab only, which batch you are viewing (<code>nuvora.batch</code>) and the page to return to after signing in (<code>nuvora.next</code>).`)}
    </ul>
    <div class="abt-check" data-abt-device hidden>
      <h3>${icon('shield')} In this browser right now</h3>
      <ul>
        <li><b>Saved plan <code>nuvora.plan</code></b><span data-abt-key="plan">Checking</span></li>
        <li><b>Answers for this visit <code>nuvora.answers</code></b><span data-abt-key="answers">Checking</span></li>
        <li><b>Portal sign-in <code>nuvora.session</code></b><span data-abt-key="session">Checking</span></li>
      </ul>
      <div class="row">
        <button class="btn ghost" type="button" data-abt-forget hidden>Forget my plan</button>
        <p data-abt-status role="status" tabindex="-1"></p>
      </div>
    </div>
    <p>You can also remove everything this website has stored by clearing site data for this website in your browser settings.</p>`],
  ['seat-requests', 'Seat requests', html`
    <p>The <a href="/admissions/#request">seat request form</a> is how you tell us you would like a place in a batch. It asks for:</p>
    <ul>
      <li>your name, email address and the country you live in;</li>
      <li>a phone number, if you choose to give one;</li>
      <li>the program and start date you want;</li>
      <li>your saved Find my program plan, only if you saved one and tick the box to include it: your answers about your background, goal, weekly time and coding, your answer about a bachelor’s degree if you gave one, and your best match and its score.</li>
    </ul>
    <p>We use these details only to reply to you about your request. They are stored with our database provider (see <a href="#providers">service providers</a>). Sending a request needs your agreement to this, which you give with the tick box on the form.</p>
    <p>The page shows the same “Request received” message for every request it accepts, whether or not the same request was sent before, so it never reveals anything about earlier requests. A request can only be confirmed through the email address given in it: Nuvora replies there.</p>`],
  ['advisor', 'The advisor', html`
    <p>On this website, the advisor’s answers come from fixed rules that run in your browser, using the published catalog. Nothing you type is sent anywhere, and the advisor is labelled as giving catalog answers.</p>
    <p>Where an AI model is connected, the advisor is labelled as AI, and your questions are sent to the AI provider, Anthropic, to generate the answers. Please do not share personal information with the advisor.</p>`],
  ['portal', 'The student portal', html`
    <p>When you have a portal account, Nuvora keeps the records needed to run your course:</p>
    <ul>
      <li><b>Account:</b> your name and email address, and when you were last active.</li>
      <li><b>Enrolments:</b> your programs, batches and terms.</li>
      <li><b>Watch progress:</b> which parts of each lesson you have watched, recorded in 10-second slices. A lesson counts as complete at 90% watched.</li>
      <li><b>Live attendance:</b> when you joined each live session and for how many minutes, from Zoom.</li>
      <li><b>Submissions:</b> the links, files and notes you submit for projects.</li>
      <li><b>Grades and feedback:</b> your rubric grade and your instructor’s written feedback for each project.</li>
      <li><b>Notifications:</b> messages about your course, such as new grades and reminders before your portal access would pause, which may also be sent to you by email.</li>
      <li><b>Payments:</b> the tuition payments recorded for you, with the term, amount, date and how it was paid.</li>
      <li><b>Access history:</b> when your portal access was paused or restored, whether by the rule for unpaid terms or by a Nuvora administrator, and the reason given.</li>
    </ul>
    <p>Your last activity is used for one more thing: learners who have been inactive for 14 days appear on their instructor’s check-in list, so someone can see whether you need help.</p>
    <p>Lessons and recordings stream in the portal and are never downloadable. PDF materials are delivered through short-lived download links.</p>`],
  ['grades', 'Who can see your records', html`
    <ul>
      <li><b>You</b> see your own progress, attendance, submissions, grades and feedback.</li>
      <li><b>Your instructors</b> see the progress, attendance, submissions and grades of the learners they teach.</li>
      <li><b>Nuvora administrators</b> can see these records to run the school and handle problems. They can also see each student’s payment records and access history, to record tuition payments and to pause or restore portal access.</li>
    </ul>
    <p>Other students cannot see your grades, feedback, progress, payments or access history.</p>`],
  ['providers', 'Service providers', html`
    <p>We use these services to run the website and portal. Each one handles only what it needs for its job.</p>
    <ul class="abt-cards">
      ${card('Supabase', '', [['Used for', 'Database, sign-in and file storage, including seat requests and portal records'], ['Hosting region', later('To be confirmed')]])}
      ${card('Zoom', '', [['Used for', 'Live classes and office hours, and their attendance records']])}
      ${card('Video streaming service', '', [['Used for', 'Streaming lessons and recordings so they cannot be downloaded'], ['Provider', later('To be named before lessons go live')]])}
      ${card('Email provider', '', [['Used for', 'Sending email, such as notifications'], ['Provider', later('To be named before payments open')]])}
      ${card('Payment provider', '', [['Used for', 'Taking tuition and fee payments once payments open'], ['Provider', later('To be named before payments open')]])}
      ${card('Google Fonts', '', [['Used for', 'Delivering fonts: Plus Jakarta Sans, Source Serif 4 and Outfit on the website, and JetBrains Mono in the portal. Google receives your IP address and browser details']])}
      ${card('Anthropic', '', [['Used for', 'Generating advisor answers, only where an AI model is connected']])}
    </ul>`],
  ['retention', 'How long we keep information', html`
    <ul>
      <li>Your saved plan is used for up to 90 days, and your answers for this visit last until you close the tab. Both stay on your device.</li>
      <li>How long we keep seat requests and portal records: ${later(LATER.toLowerCase())}.</li>
    </ul>`],
  ['rights', 'Your rights', html`
    <p>You can ask us for a copy of the information we hold about you, ask us to correct it, and ask us to delete it. ${contactLine()}</p>
    <p>Grievance officer: ${OWNER.grievanceOfficer ? (typeof OWNER.grievanceOfficer === 'string' ? OWNER.grievanceOfficer : [OWNER.grievanceOfficer.name, OWNER.grievanceOfficer.email].filter(Boolean).join(' · ')) : later(LATER.toLowerCase())}.</p>
    <p>Information kept only in your browser is under your control: use “Forget my plan”, sign out of the portal, or clear this website’s data in your browser.</p>`],
  ['changes', 'Changes to this notice', html`
    <p>This is a draft. It will be reviewed by counsel before launch, and the reviewed version will replace it on this page. Each version shows its date at the top.</p>`],
];

// ---------------------------------------------------------------- terms of use
const TERMS = [
  ['summary', 'In short', html`
    <ul class="abt-short">
      <li>${icon('check')}<span>A seat request is not admission or a contract, and nothing is charged.</span></li>
      <li>${icon('check')}<span>Tuition is paid one term at a time. <a href="#paying">What happens if a term isn’t paid</a>.</span></li>
      <li>${icon('check')}<span>Programs lead to a ${CREDENTIAL.short}, not an accredited degree.</span></li>
      <li>${icon('check')}<span>Course videos are for streaming only: no downloading, recording or sharing.</span></li>
      <li>${icon('check')}<span>Keep your portal account to yourself, and submit your own work.</span></li>
    </ul>`],
  ['status', 'Nuvora is pre-launch', html`
    <p>Nuvora is preparing its first batch. This website describes the programs as they are planned. There are no graduates, reviews or outcome data yet.</p>
    <p>Programs, dates and prices can change before launch. The program pages always show the current plan, and tuition is launch pricing in US dollars.</p>`],
  ['seat-requests', 'Seat requests are not admission', html`
    <p>Sending a seat request tells us which program and start date you are interested in. It is not an application, an offer of admission, a reserved place or a contract, and nothing is charged. We reply by email.</p>
    <p>To enrol, you complete the application, pay the one-time ${money(TUITION.applicationFee)} application fee and pay for your first term. You pay one term at a time. The refund and deferral policy will be published before the first batch, and you will see it before you pay.</p>`],
  ['paying', 'Paying tuition and portal access', html`
    <p>${ACCESS_RULE}</p>
    <p>For now, Nuvora records payments by hand. Prices are launch pricing in US dollars, and the <a href="/tuition/">tuition page</a> lists every program’s price per term.</p>`],
  ['credential', 'The credential', html`
    <ul>
      <li>Finishing a program earns a <b>${CREDENTIAL.short}</b>. It is not an accredited degree.</li>
      <li>Program names such as B.S. and M.S. describe the level and scope of study.</li>
      <li>Nuvora credits describe workload and may not transfer to universities or other schools.</li>
      <li>Nuvora does not accept transfer credit and does not offer test-outs.</li>
    </ul>`],
  ['portal', 'Using the student portal', html`
    <p>When you use the portal, please:</p>
    <ul>
      <li>keep your sign-in details to yourself and do not share your account;</li>
      <li>submit work that is your own, and say where you used other people’s code, data or text;</li>
      <li>be respectful to instructors and other learners in live sessions and in anything you submit;</li>
      <li>do not try to reach other people’s accounts or data, get around the portal’s protections, or disrupt the service.</li>
    </ul>
    <p>Live sessions on Zoom are recorded, and the recordings stream in the portal.</p>`],
  ['content', 'Course content', html`
    <p>Lessons, recordings, lesson notes, exercise sheets and project briefs belong to Nuvora and its instructors.</p>
    <ul>
      <li><b>Videos stream only.</b> Downloading, recording (including screen recording) or sharing lesson videos and class recordings is not allowed.</li>
      <li><b>PDFs are for your own study.</b> You may download and keep lesson notes, exercise sheets and project briefs, but not share, sell or publish them.</li>
      <li><b>Your project work.</b> You may show the work you made for a project, for example in a portfolio, but not the project brief itself. Submitting work lets Nuvora and your instructors store, review and grade it.</li>
    </ul>`],
  ['assessment', 'Assessment', html`
    <p>Each term has ${PROJECTS_PER_TERM} projects, graded by instructors on a four-level rubric: Distinguished, Proficient, Basic and Not yet. Proficient or better passes. Below that, you get written feedback and resubmit. A lesson counts as complete when you have watched 90% of it.</p>`],
  ['accounts', 'Accounts and security', html`
    <ul>
      <li>You are responsible for keeping your password safe. Only choose “Keep me signed in on this device” on a device that is yours.</li>
      <li>If you think someone else has used your account, tell us. ${contactLine()}</li>
      <li>We may suspend an account that breaks these terms, for example by sharing course videos.</li>
    </ul>`],
  ['information', 'Information, not promises', html`
    <p>The website, Find my program and the advisor give general information from the published catalog. Nuvora teaches skills used in data and AI roles, but does not guarantee jobs, promotions or salaries.</p>`],
  ['changes', 'Changes to these terms', html`
    <p>This is a draft. It will be reviewed by counsel before launch, and the reviewed version will replace it on this page. Each version shows its date at the top.</p>`],
  ['law', 'Governing law and contact', html`
    <ul>
      <li>Governing law: ${later('To be published before launch')}</li>
      <li>Legal entity and registered address: ${OWNER.legalEntity ? html`${OWNER.legalEntity}${OWNER.address ? html`, ${OWNER.address}` : ''}` : later('To be published before launch')}</li>
      <li>Contact: ${OWNER.supportEmail ? html`<a href="mailto:${OWNER.supportEmail}">${OWNER.supportEmail}</a>` : later('To be published before launch')}</li>
    </ul>
    <p>Until then, the <a href="/contact/">contact page</a> lists the ways to reach us today.</p>`],
];

// ---------------------------------------------------------------- accessibility statement
// Only what is built and tested today: the checks named under "How we test" are the ones in tests/e2e and
// tests/site. Anything not done yet (screen reader testing, an audit, captions) is listed as a limit.
const reportLine = () => (OWNER.supportEmail
  ? html`Write to <a href="mailto:${OWNER.supportEmail}">${OWNER.supportEmail}</a>.`
  : html`The <a href="/contact/">contact page</a> lists the ways to reach us today. A support email address will be published there before the first batch.`);

const ACCESSIBILITY = [
  ['target', 'Our target', html`
    <p>We aim for this website and the student portal to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>
    <p>We do not claim full conformance yet. Nuvora is pre-launch, no independent accessibility audit has been done, and the known limits are listed below.</p>`],
  ['built-in', 'What we build in', html`
    <ul>
      <li>A skip link to the main content and one main heading on every page.</li>
      <li>Menus, tabs, the advisor and forms work with a keyboard, with a visible focus outline.</li>
      <li>Status is shown in words and icons, never by colour alone, in both the light and the dark colour scheme.</li>
      <li>On this website, main buttons are at least 44 pixels tall, and every other link or button is at least 24 by 24 pixels unless it sits inside a sentence.</li>
      <li>Pages fit screens from 320 pixels wide without sideways scrolling.</li>
      <li>If your device asks for reduced motion, the background videos do not play and animations are reduced.</li>
      <li>Form fields have visible labels, and form errors are written out in words next to the field.</li>
      <li>Images have text alternatives, and decorative ones are hidden from screen readers. The chart in the sample lesson has a text description and a written readout.</li>
    </ul>`],
  ['testing', 'How we test', html`
    <p>Automated checks in our test suite run in a real browser. They catch many problems, but they are not a substitute for testing by disabled people.</p>
    <ul>
      <li><b>Every page at five screen sizes.</b> Each page in the sitemap is opened at 320, 360, 390, 768 and 1280 pixels wide and checked for content that sticks out sideways, links and buttons smaller than 24 by 24 pixels, form fields without labels, links and buttons without a name, images without a text alternative and more than one main heading. On phones, text fields must use text of at least 16 pixels so the page does not zoom.</li>
      <li><b>The dark colour scheme.</b> Every page is opened in the dark colour scheme and checked for a dark background and for errors.</li>
      <li><b>Keyboard checks.</b> The phone menu opens, closes with Escape and returns focus to its button. The career tabs move with the arrow keys. The advisor closes with Escape and returns focus to the button that opened it.</li>
      <li><b>Reduced motion.</b> With reduced motion requested, no video plays on the home page.</li>
      <li><b>Page structure.</b> Every built page is checked for its language, a page title, one main heading and the main region the skip link points to.</li>
      <li><b>The student portal.</b> Its pages are checked at phone and desktop sizes, in light and dark mode, for content that runs off the screen, one main heading and labelled fields.</li>
    </ul>`],
  ['limits', 'Known limits', html`
    <ul>
      <li><b>No screen reader testing yet.</b> We have not yet tested with screen readers such as NVDA, JAWS, VoiceOver or TalkBack.</li>
      <li><b>Colour contrast is not measured automatically.</b> The checks above do not yet measure contrast on every page.</li>
      <li><b>Lesson videos.</b> Lessons and recordings play in a placeholder player while the streaming service is set up. Captions and transcripts are not available yet.</li>
      <li><b>Smaller buttons in the portal.</b> Some secondary buttons in the student portal and the staff admin area are less than 44 pixels tall.</li>
      <li><b>Live classes.</b> Live sessions run on Zoom, so their accessibility also depends on Zoom.</li>
      <li><b>Course PDFs.</b> The PDFs in the portal today are generated placeholders and have not been checked for accessibility.</li>
      <li><b>Stock video clips.</b> The short clips on the home page are decorative and have no sound. A button pauses them.</li>
    </ul>`],
  ['report', 'Report a problem', html`
    <p>If something on this website or in the student portal is hard to use, please tell us which page it is, what you were trying to do, and the browser, device or assistive technology you use.</p>
    <p>${reportLine()}</p>`],
  ['statement', 'About this statement', html`
    <p>This statement was prepared on ${A11Y_DATE}, from the checks in our test suite on that date, and last updated on ${A11Y_UPDATED}. It will be updated as the website and portal change.</p>`],
];

// ---------------------------------------------------------------- credits
const CREDITS = [
  ['photos', 'Photos', html`
    <p>Stock photos from Unsplash, used under their licence. Each links to its page on Unsplash.</p>
    <ul class="abt-media">${Object.values(PHOTOS).map((p) => html`
      <li><img src="${p.src}" alt="" loading="lazy" decoding="async" width="96" height="96" style="object-position:${p.pos}">
        <div><b>${p.alt}</b><span>Photo by ${p.by} on Unsplash</span>
        <a href="https://unsplash.com/photos/${p.id}" rel="noopener">View on Unsplash<span class="sr-only">: photo by ${p.by}</span></a></div></li>`)}</ul>`],
  ['video', 'Video clips', html`
    <p>Stock video clips from Pexels, used under their licence. Each links to its page on Pexels.</p>
    <ul class="abt-media">${CLIPS.map((c) => html`
      <li><span class="abt-vid">${icon('video')}</span>
        <div><b>${c.title}</b><span>Video by ${c.by} on Pexels</span>
        <a href="${c.url}" rel="noopener">View on Pexels<span class="sr-only">: video by ${c.by}</span></a></div></li>`)}</ul>`],
  ['fonts', 'Fonts', html`
    <ul class="abt-cards">
      ${card('Clash Grotesk', '', [['By', 'Indian Type Foundry'], ['Licence', 'ITF Free Font License'], ['Source', html`<a href="https://www.fontshare.com/" rel="noopener">fontshare.com</a>, served from this website`]])}
      ${card('Plus Jakarta Sans, Source Serif 4 and Outfit', '', [['Licence', 'SIL Open Font License'], ['Source', html`<a href="https://fonts.google.com/" rel="noopener">Google Fonts</a>`]])}
      ${card('JetBrains Mono', '', [['Used in', 'The student portal'], ['Licence', 'SIL Open Font License'], ['Source', html`<a href="https://fonts.google.com/" rel="noopener">Google Fonts</a>`]])}
    </ul>`],
];

const PAGES = {
  privacy: {
    path: '/legal/privacy/', label: 'Privacy notice',
    title: 'Privacy notice (draft): website and student portal',
    description: 'Draft privacy notice for the Nuvora website and student portal: no cookies or trackers, what stays on your device, seat requests, portal records and providers.',
    lede: 'What the Nuvora website and student portal collect, what stays in your browser, who can see your records and which services we use. In plain English.',
    sections: PRIVACY,
    intro: draftNote('This plain-English notice describes how the Nuvora website and student portal handle information today.'),
    side: html`Questions? <a href="/contact/">How to reach us</a>.`,
  },
  terms: {
    path: '/legal/terms/', label: 'Terms of use',
    title: 'Terms of use (draft): website and student portal',
    description: 'Draft terms of use for Nuvora: seat requests are not admission, the certificate is not an accredited degree, and course videos may not be downloaded or shared.',
    lede: 'The rules for using the Nuvora website and student portal: what a seat request means, what the credential is, and how course content may be used.',
    sections: TERMS,
    intro: draftNote('These plain-English terms set out the rules for using the Nuvora website and student portal as they work today.'),
    side: html`Questions? <a href="/contact/">How to reach us</a>.`,
  },
  accessibility: {
    path: '/legal/accessibility/', label: 'Accessibility statement',
    title: 'Accessibility statement: WCAG 2.2 AA target, tests, limits',
    description: 'How accessible the Nuvora website and student portal are today: the WCAG 2.2 AA target, how pages are tested, the known limits and how to report a problem.',
    lede: 'What we aim for, what we build in, how we test it, what does not work well yet, and how to tell us about a problem.',
    sections: ACCESSIBILITY,
    intro: html`<div class="abt-draft" role="note">${icon('info')}<div><b>Statement of ${A11Y_DATE}</b><p>Nuvora is pre-launch. This statement describes the website and student portal as they are today.</p></div></div>`,
    side: html`Found a problem? <a href="#report">Tell us</a>.`,
  },
  credits: {
    path: '/legal/credits/', label: 'Media credits',
    title: 'Media credits: stock photos, video clips and fonts',
    description: 'Credits for the stock photos (Unsplash), video clips (Pexels) and fonts used on the Nuvora website. All people shown are models, not Nuvora students or staff.',
    lede: 'The photos, video clips and fonts used on this website, who made them and the licences they are used under.',
    sections: CREDITS,
    intro: html`<div class="abt-draft" role="note">${icon('users')}<div><b>The people shown are models</b><p>Every person in the photos and video clips on this website appears in stock media. They are not Nuvora students or staff, and no image shows a Nuvora result.</p></div></div>`,
  },
};

export default function legal({ today } = {}) {
  return Object.values(PAGES).map((d) => {
    const crumbs = [['/', 'Home'], [d.path, d.label]];
    const body = html`
${pageHead({ eyebrow: 'Legal', title: accent(d.label.replace(/(\S+)$/, '*$1*')), lede: d.lede, crumbs, extra: legalNav(d.path) })}
${legalLayout(d)}`;
    return {
      path: d.path,
      html: page({
        path: d.path, today,
        title: d.title,
        description: d.description,
        body,
        schema: [breadcrumbList(crumbs)],
        scripts: ['/js/about.js'],
        styles: ['/css/about.css'],
      }),
    };
  });
}
