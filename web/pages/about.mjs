// /about/: what Nuvora is, why it exists, who is behind it, what is real today, its principles and how results
// will be reported (#outcomes, linked from the founding panel). Pre-launch facts only: no people, numbers or proof
// that do not exist yet.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { sectionHead, photo, ctaBand } from '../lib/components.mjs';
import { breadcrumbList } from '../lib/schema.mjs';
import { PROGRAMS, LEVELS, CREDENTIAL, TUITION, money } from '../data/programs.mjs';
import { SCHEDULE, OWNER } from '../data/site.mjs';

const PATH = '/about/';
const CRUMBS = [['/', 'Home'], [PATH, 'About Nuvora']];
const PROJECTS_PER_TERM = PROGRAMS[0].terms[0].projects.length;

const intro = () => html`
<section class="sec" id="what" aria-labelledby="what-title">
  <div class="wrap abt-intro">
    <div class="abt-copy">
      <span class="eyebrow">What Nuvora is</span>
      <h2 id="what-title">${accent('Online programs, taught *live*, graded by people')}</h2>
      <p class="lede">We are preparing our first batch, so everything on this site describes how the programs are designed to run, not results from past students.</p>
      <p>Every program is taught in 12-week terms. Each term is a batch that starts on the first Monday of a month. You watch lessons in the student portal when it suits you, join a live ${SCHEDULE.classMinutes}-minute class on ${SCHEDULE.classDay}s and ${SCHEDULE.officeMinutes}-minute office hours on ${SCHEDULE.officeDay}s at ${SCHEDULE.classTime} US time, and complete ${PROJECTS_PER_TERM} projects a term that instructors grade.</p>
      <p>Finishing a program earns a ${CREDENTIAL.short}. ${CREDENTIAL.note}</p>
      <div class="row">
        <a class="btn primary" href="/programs/">Browse programs ${icon('arrow')}</a>
        <a class="btn ghost" href="/how-it-works/">How a term works</a>
      </div>
    </div>
    <div class="abt-levels">
      <h3>${PROGRAMS.length} programs at three levels</h3>
      <ul>${LEVELS.map(([lvl, title]) => {
        const list = PROGRAMS.filter((p) => p.level === lvl);
        return html`<li class="abt-lv"><span class="n" aria-hidden="true">${list.length}</span>
          <div><b><span class="sr-only">${list.length} </span>${title}${lvl === 'Certificate' ? '' : ' programs'}</b>
          <span>${list[0].duration} · ${money(TUITION.perTerm[lvl])} per term</span></div></li>`;
      })}</ul>
      <p class="small">Plus a one-time ${money(TUITION.applicationFee)} application fee. Launch pricing in US dollars, paid one term at a time.</p>
      <a class="link" href="/programs/#compare">Compare every program ${icon('arrow')}</a>
    </div>
  </div>
</section>`;

const WHY = [
  ['brief', 'Practical skills', `Each term is built around ${PROJECTS_PER_TERM} projects that instructors grade with written feedback, so you practise the work instead of only watching it. Below the passing standard, you revise and resubmit.`],
  ['live', 'People who teach', `Lessons on demand give you flexibility. A live class every ${SCHEDULE.classDay} and office hours every ${SCHEDULE.officeDay} mean an instructor answers your questions.`],
  ['shield', 'Honest information', 'Prices, dates, weekly hours and the limits of the credential are on every program page. We show no invented proof, and when we have results we will publish them with how they were measured.'],
];

const why = () => html`
<section class="sec tinted" id="why">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Why Nuvora', title: 'Why we are *building it*', lede: 'Learning data and AI online too often means videos with nobody to ask, or claims that are hard to check. We want practical skills, taught by people, with information you can verify.' })}
    <div class="abt-why">
      ${photo('duo')}
      <ul class="abt-whylist">${WHY.map(([ic, title, text]) => html`
        <li><span class="abt-ico">${icon(ic)}</span><div><h3>${title}</h3><p>${text}</p></div></li>`)}</ul>
    </div>
  </div>
</section>`;

const people = () => (OWNER.instructors.length
  ? html`<ul class="abt-people">${OWNER.instructors.map((p) => html`<li><b>${p.name}</b>${p.role && html`<span>${p.role}</span>`}</li>`)}</ul>`
  : html`<div class="stack">
      <h3>What each profile will include</h3>
      <ul class="abt-people">
        <li><b>Who they are</b><span>Name and photo, shared only with their permission.</span></li>
        <li><b>What they know</b><span>Their background and the subjects they teach.</span></li>
        <li><b>What they do at Nuvora</b><span>The live classes they teach and the projects they grade.</span></li>
      </ul>
    </div>`);

const team = () => html`
<section class="sec" id="team">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Team', title: 'The people *behind it*' })}
    <div class="abt-team">
      <div class="abt-teamnote">
        <span class="abt-ico">${icon('users')}</span>
        <strong>Founder and instructor profiles will be published with their permission before the first batch.</strong>
        <p>We do not show anyone’s name, photo or job title until they have agreed to it, and we do not use placeholder people. The people in photos on this site are stock models, not Nuvora students or staff.</p>
      </div>
      ${people()}
    </div>
  </div>
</section>`;

// Three honest statuses. "Built and tested" means it works in the portal today and the test suite checks it;
// "In progress" means it exists only in part, or is being built now; "Not yet" means it does not exist.
const BUILT = [
  ['The program and term plans', `${PROGRAMS.length} programs, each planned term by term: lessons, live sessions and ${PROJECTS_PER_TERM} graded projects per term.`],
  ['Live session links', `The Jitsi links for the ${SCHEDULE.classDay} class and ${SCHEDULE.officeDay} office hours appear in the portal from 15 minutes before each session until it ends, timed by the server’s clock.`],
  ['Assignments and grading', 'Project submission, instructor grading on the four-level rubric, written feedback and resubmission.'],
  ['Lesson progress', 'A lesson completes at 90% watched, measured from the time really watched, not from clicks.'],
  ['Learning path and next step', 'Your program term by term with its dates, one recommended next step with the reason shown, and the skills your career goal still needs.'],
  ['Streaks and skill badges', 'A learning streak you can switch off, and skill badges earned only from graded work.'],
  ['Notifications', 'New grades, recordings and achievements, listed in the portal.'],
  ['Staff admin area', 'Nuvora staff enrol students, record tuition payments by hand and pause or restore a student’s portal access in the portal. Every admin action is written to an audit log.'],
  ['Access rule for unpaid terms', 'The database applies the published rule on every request, using its own clock. The hourly job that records each pause and sends the reminders before one is built and tested, and is switched on at go-live.', ['/tuition/#access', 'The published rule']],
];
const IN_PROGRESS = [
  ['Lesson streaming', 'Lessons and recordings play in a placeholder player while the protected streaming service is set up. Videos stream only and are never downloadable; the service will be named before lessons go live.'],
  ['Course PDFs', 'Downloading PDFs works in the portal, but the course PDFs there today are generated placeholders. The real lesson notes, exercise sheets and project briefs are being written.'],
];
const NOT_YET = [
  ['Attendance from Jitsi', 'The portal can record and show live attendance, but the automatic import from Jitsi is not connected yet.', null],
  ['Graduates', 'No batch has run yet.', null],
  ['Reviews and ratings', 'There is nobody to review us yet, so we show none.', null],
  ['Outcome data', 'Completion, pass and attendance rates come after the first batch.', ['#outcomes', 'How we will report them']],
  ['Accreditation', `Programs lead to a ${CREDENTIAL.short}, not an accredited degree.`, null, 'Not accredited'],
  ['Employer partners', 'We have none, so we show no employer names or logos.', null],
  ['Online payments', 'Paying online is not open yet. A seat request is not a payment.', null],
];

const real = () => html`
<section class="sec tinted" id="real-today">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Status', title: 'What’s *real* today', lede: 'A plain list of what exists and has been tested, what is in progress, and what does not exist yet. We will update it as things change.' })}
    <div class="tablewrap abt-real">
      <table>
        <caption class="sr-only">What Nuvora has built and tested, what is in progress, and what does not exist yet</caption>
        <thead><tr><th scope="col">What</th><th scope="col">Status</th></tr></thead>
        <tbody>
          <tr class="abt-group"><th scope="colgroup" colspan="2">Built and tested now</th></tr>
          ${BUILT.map(([what, detail, link]) => html`<tr><th scope="row">${what}<span>${detail}${link && html` <a href="${link[0]}">${link[1]}</a>`}</span></th>
            <td><span class="abt-status yes">${icon('check')} Built and tested</span></td></tr>`)}
          <tr class="abt-group"><th scope="colgroup" colspan="2">In progress</th></tr>
          ${IN_PROGRESS.map(([what, detail, link]) => html`<tr><th scope="row">${what}<span>${detail}${link && html` <a href="${link[0]}">${link[1]}</a>`}</span></th>
            <td><span class="abt-status wip">${icon('pulse')} In progress</span></td></tr>`)}
          <tr class="abt-group"><th scope="colgroup" colspan="2">Not yet</th></tr>
          ${NOT_YET.map(([what, detail, link, status = 'Not yet']) => html`<tr><th scope="row">${what}<span>${detail}${link && html` <a href="${link[0]}">${link[1]}</a>`}</span></th>
            <td><span class="abt-status no">${icon(status === 'Not yet' ? 'clock' : 'x')} ${status}</span></td></tr>`)}
        </tbody>
      </table>
    </div>
  </div>
</section>`;

const PRINCIPLES = [
  ['spark', 'No made-up proof', 'No invented reviews, quotes, ratings, numbers, logos or popularity claims. Stock photos are labelled, and the people in them are models.', ['/legal/credits/', 'Media credits']],
  ['chart', 'Publish results with methods', 'Every figure we publish will come with its definition, the dates it covers and how many learners it counts.', ['#outcomes', 'Reporting methods']],
  ['video', 'Protect instructors’ work', 'Lessons and recordings stream in the portal and can never be downloaded. Lesson notes and project briefs are PDFs you keep.', ['/legal/terms/#content', 'Course content rules']],
  ['lock', 'Privacy by default', 'No cookies, analytics or ad trackers on this website. Your Find my program answers stay in your browser unless you choose to send them.', ['/legal/privacy/', 'Privacy notice']],
];

const principles = () => html`
<section class="sec" id="principles">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Principles', title: 'How we *work*' })}
    <ul class="abt-principles">${PRINCIPLES.map(([ic, title, text, [href, label]], i) => html`
      <li class="abt-pr"><span class="k" aria-hidden="true">0${i + 1}</span><span class="abt-ico">${icon(ic)}</span>
        <h3>${title}</h3><p>${text}</p><a class="link" href="${href}">${label} ${icon('arrow')}</a></li>`)}</ul>
  </div>
</section>`;

const MEASURES = [
  ['Completion rate', 'Of everyone enrolled when a term starts, the share who complete it. Learners who withdraw stay in the count, as not completed, so leaving early can never make the rate look better.', 'Learners who completed the term ÷ learners enrolled on its first day'],
  ['First-attempt pass rate', 'The share of first submissions graded Proficient or better, before any feedback or resubmission.', 'First submissions at Proficient or Distinguished ÷ all first submissions'],
  ['Final pass rate', 'The share of projects that reach Proficient or better by the end of the term, after feedback and resubmission.', 'Projects at Proficient or better ÷ all projects due, including those never submitted'],
  ['Live attendance', 'How many of the live classes and office hours learners joined, from Jitsi attendance records. Watching a recording later does not count as attending.', 'Sessions joined ÷ sessions held, averaged across learners'],
  ['Lesson completion', 'How many lessons learners completed. A lesson counts once 90% of it has really been watched, so skipping ahead does not count.', 'Lessons completed ÷ lessons released, averaged across learners'],
];

const outcomes = () => html`
<section class="sec dark on-dark" id="outcomes">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Results', title: 'How we will *report results*', lede: 'When a batch finishes, we will publish what happened, measured the same way every time. These are the definitions we will use.' })}
    <div class="abt-nodata" role="note">
      <span class="abt-ico">${icon('info')}</span>
      <div><b>No outcome data yet</b><p>Nuvora has not run a batch, so there are no completion, pass or attendance figures to show. The first figures will appear here after the first batch ends.</p></div>
    </div>
    <div class="abt-defs">${MEASURES.map(([title, text, calc]) => html`
      <div class="abt-def"><h3>${title}</h3><p>${text}</p><p class="abt-calc">${calc}</p></div>`)}</div>
    <div class="abt-rules">
      <div class="abt-rule">${icon('users')}<div><b>Every figure says who it covers</b><p>We will say how many learners each figure covers, so you can judge how much a small group can tell you.</p></div></div>
      <div class="abt-rule">${icon('cal')}<div><b>Published after each batch</b><p>Every report gives the dates the batch ran and the number of learners it covers, next to the definitions above.</p></div></div>
    </div>
  </div>
</section>`;

const body = () => html`
${pageHead({
  eyebrow: 'About Nuvora',
  title: accent('A new school for *data and AI*'),
  lede: 'Nuvora is a new online school for data science and AI, preparing its first batch. Here is what we are, what exists today, what does not exist yet, and how we will report results once there are some.',
  crumbs: CRUMBS,
  extra: html`<div class="abt-chips">
    <span class="chip frost">${icon('info')} Pre-launch</span>
    <span class="chip frost">${icon('cal')} 12-week terms</span>
    <span class="chip frost">${icon('live')} Live classes every week</span>
    <span class="chip frost">${icon('cert')} Instructor-graded projects</span>
  </div>`,
})}
${intro()}
${why()}
${team()}
${real()}
${principles()}
${outcomes()}
${ctaBand({ title: 'Start with the program that *fits you*' })}`;

export default function about({ today } = {}) {
  return [{
    path: PATH,
    html: page({
      path: PATH, today,
      title: 'About Nuvora: a new online school for data and AI',
      description: 'Nuvora is a new online school for data science and AI, preparing its first batch. See what is built today, what is not yet, and how we will report results.',
      body: body(),
      schema: [breadcrumbList(CRUMBS)],
      styles: ['/css/about.css'],
    }),
  }];
}
