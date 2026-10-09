// How it works (/how-it-works/): the Nuvora Learning System, a 12-week term week by week, the student portal,
// assessment, the credential and support. Every fact comes from the data modules; nothing here describes
// outcomes. Features are described as current only when they exist in the portal today; anything still being set
// up (the streaming service, the real course PDFs, mentoring) says so.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead, liveDate } from '../lib/layout.mjs';
import { schedule, weekView, rubric, faqList, ctaBand, photo } from '../lib/components.mjs';
import { breadcrumbList, faqPage } from '../lib/schema.mjs';
import { PROGRAMS, CREDENTIAL, nextStarts, termDates, fmtDay, isoDay } from '../data/programs.mjs';
import { SCHEDULE, OWNER } from '../data/site.mjs';

const PATH = '/how-it-works/';
const CRUMBS = [['/', 'Home'], [PATH, 'How it works']];
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

// Derived facts. Every term has the same project days (18, 46 and 81 of the batch), so weeks 3, 7 and 12.
const WEEKS = SCHEDULE.weeks;
const PROJECT_WEEKS = PROGRAMS[0].terms[0].projects.map(([, day]) => Math.ceil(day / 7));
const PROJECTS = PROJECT_WEEKS.length;
const listWeeks = (ws) => `${ws.slice(0, -1).join(', ')} and ${ws[ws.length - 1]}`;
const DUE_WEEKS = listWeeks(PROJECT_WEEKS);
const hours = PROGRAMS.flatMap((p) => p.weeklyHours.split('â€“').map(Number));
const HOURS = [Math.min(...hours), Math.max(...hours)];
const credits = PROGRAMS.map((p) => p.credits);
const CREDITS = [Math.min(...credits), Math.max(...credits)];
const CLASS = `${SCHEDULE.classDay}s`;
const OFFICE = `${SCHEDULE.officeDay}s`;
const day3 = (d) => d.slice(0, 3);

const SECTIONS = [['learning-system', 'Learning system'], ['term', 'A term'], ['portal', 'Student portal'], ['assessment', 'Assessment'],
  ['credential', 'Credential'], ['support', 'Support'], ['faq', 'FAQ']];

const FAQ = [
  ['What happens if I miss a live session?',
    'Every live class and office-hours session is recorded and streams in the student portal, so you can catch up when it suits you.'],
  ['When are the live sessions?',
    `A ${SCHEDULE.classMinutes}-minute class every ${SCHEDULE.classDay} and ${SCHEDULE.officeMinutes}-minute office hours every ${SCHEDULE.officeDay}, both at ${SCHEDULE.classTime} US time on Jitsi. Join links open in the portal 15 minutes before each session.`],
  ['Can I download the lesson videos?',
    'No. Lessons and class recordings stream in the student portal only and can never be downloaded. Lesson notes, exercise sheets and project briefs are PDFs you can download and keep.'],
  ['When does a lesson count as complete?',
    'When you have watched 90% of it. Progress comes from the time you have really watched, not from clicks.'],
  ['What happens if my project is graded Basic or Not yet?',
    'Your instructor writes feedback on what is missing, and you revise and resubmit the project. Proficient or Distinguished is a pass.'],
  ['How many hours a week should I plan for?',
    `Between ${HOURS[0]} and ${HOURS[1]} hours, depending on the program: the two live sessions plus lessons and project work at your own time. Each program page lists its weekly hours.`],
  ['What if I fall behind?',
    `Watch the recordings and bring questions to ${SCHEDULE.officeDay} office hours. If you have not been active for 14 days, you appear on your instructorâ€™s check-in list so they can reach out.`],
  ['Is the certificate an accredited degree?',
    `No. You receive a ${CREDENTIAL.short}, not an accredited degree. Nuvora credits describe workload and may not transfer to universities, and Nuvora does not accept transfer credit or offer test-outs.`],
];

// A section heading whose h2 carries an id, so the section can be labelled by it.
const head = ({ id, eyebrow, title, lede }) => html`
<div class="shead"><div>${eyebrow && html`<span class="eyebrow">${eyebrow}</span>`}<h2 id="${id}">${accent(title)}</h2>${lede && html`<p class="lede">${lede}</p>`}</div></div>`;

// ---------- the Nuvora Learning System (compact pillars) ----------
const PILLARS = [
  { n: '01', title: 'Learn *smarter*',
    lede: 'Watch lessons when it suits you, inside a learning path that lays out every term, date and project of your program.',
    points: ['Every term, date and deadline in one learning path', 'Progress from real watch time: a lesson counts at 90% watched', 'PDF notes and briefs to keep; videos stream in the portal'] },
  { n: '02', title: 'Prove *mastery*',
    lede: `Competency is shown, not assumed. Every term has ${NUM[PROJECTS]} projects, graded by instructors on a four-level rubric.`,
    points: [`Projects due in weeks ${DUE_WEEKS}`, 'Written feedback on every submission', 'Proficient or better passes; below that, revise and resubmit'] },
  { n: '03', title: 'Stay *supported*',
    lede: 'Instructors teach live and grade your work, office hours run every week, and your instructor sees when you go quiet.',
    points: [`Live class on ${CLASS}, office hours on ${OFFICE}`, 'Instructors who teach your classes and grade your projects', 'Inactive for 14 days? You appear on your instructorâ€™s check-in list'] },
];

const learningSystem = () => html`
<section class="sec tinted" id="learning-system" aria-labelledby="ls-title">
  <div class="wrap">
    <div class="shead center"><div><span class="eyebrow">How you learn</span><h2 id="ls-title">${accent('The Nuvora *Learning System*')}</h2>
      <p class="lede">Three ideas shape every program: learning that fits your life, mastery you prove with real work, and people who keep you moving.</p></div></div>
    <div class="how-pillars">
      ${PILLARS.map(({ n, title, lede, points }) => html`
      <article class="how-pillar on-dark">
        <span class="how-pk" aria-hidden="true">${n}</span>
        <h3>${accent(title)}</h3>
        <p>${lede}</p>
        <ul>${points.map((p) => html`<li>${icon('check')}<span>${p}</span></li>`)}</ul>
      </article>`)}
    </div>
  </div>
</section>`;

// ---------- a term, week by week ----------
function timeline() {
  const weeks = Array.from({ length: WEEKS }, (_, i) => i + 1);
  return html`
<ol class="how-tl" aria-label="The ${WEEKS} weeks of a term">
  ${weeks.map((w) => {
    const p = PROJECT_WEEKS.indexOf(w);
    return html`
  <li class="how-wk${p >= 0 ? ' is-proj' : ''}">
    <b class="how-wn">Week ${w}</b>
    <span class="how-live">${icon('live')}${day3(SCHEDULE.classDay)} live class</span>
    <span class="how-live">${icon('users')}${day3(SCHEDULE.officeDay)} office hours</span>
    ${w === 1 && html`<span class="how-ev start">${icon('cal')}Term starts Monday</span>`}
    ${p >= 0 && html`<span class="how-ev proj">${icon('folder')}Project ${p + 1} due</span>`}
    ${w === WEEKS && html`<span class="how-ev end">${icon('cert')}Term ends</span>`}
  </li>`;
  })}
</ol>`;
}

// Example dates for the next batch; site.js refreshes this table on load (data-termpath).
function exampleDates(today) {
  const start = nextStarts(1, today)[0].start;
  const rows = termDates(start, 2);
  const label = ['Term 1', 'Term 2, if your program has more terms'];
  return html`
<div class="tablewrap how-mini"><table data-termpath="2">
  <caption>If you start on ${fmtDay(start)}</caption>
  <thead><tr><th scope="col">Term</th><th scope="col">Starts</th><th scope="col">Ends</th></tr></thead>
  <tbody>${rows.map((r, i) => html`<tr data-term="${r.term}"><th scope="row">${label[i]}</th><td><time datetime="${isoDay(r.start)}">${fmtDay(r.start)}</time></td><td><time datetime="${isoDay(r.end)}">${fmtDay(r.end)}</time></td></tr>`)}</tbody>
</table></div>`;
}

const term = (today) => html`
<section class="sec" id="term" aria-labelledby="term-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('cal')} The batch format</span><h2 id="term-title">${accent('A term, *week by week*')}</h2>
      <p class="lede">Every term is a ${WEEKS}-week batch that starts on the first Monday of a month. There are live sessions every week, and projects are due in weeks ${DUE_WEEKS}. The term ends in week ${WEEKS}.</p></div></div>
    ${timeline()}
    <div class="how-dates">
      <div class="box">
        <h3>${icon('route')} How terms fit together</h3>
        <p class="muted">A term runs from the Monday of week 1 to the Sunday of week ${WEEKS}. Programs with more than one term continue with the next term on the first Monday of a month after the previous one ends, so there can be a short break between terms.</p>
        <p class="muted">Seat requests for a start close 7 days before it. For the next start, on ${liveDate('start', 0, today)}, requests close on ${liveDate('applyBy', 0, today)}.</p>
      </div>
      ${exampleDates(today)}
    </div>
    <h3 class="how-sub">A typical week</h3>
    <p class="muted how-subtext">Times are in US time; your own time zone is shown under each session when your browser shares it.</p>
    <div class="how-stack">
      ${weekView()}
      ${schedule()}
    </div>
  </div>
</section>`;

// ---------- inside the student portal ----------
const PORTAL = [
  ['route', 'Your learning path', 'Every term of your program with its dates, lessons and project deadlines, and how far through it you are.'],
  ['play', 'Lessons that track progress', 'Pick up where you left off. A lesson counts as complete once you have watched 90% of it.'],
  ['shield', 'Protected streaming', 'Lessons and recordings stream in the portal and can never be downloaded, with a faint watermark of your email moving across the video. Until the streaming service is connected, the portal plays them in a placeholder player.'],
  ['doc', 'PDF notes and briefs', 'Lesson notes, exercise sheets and project briefs download as PDFs you can keep. The course PDFs in the portal today are placeholders while the real ones are written.'],
  ['live', 'Live session links', `Join links for the ${SCHEDULE.classDay} class and ${SCHEDULE.officeDay} office hours open 15 minutes before each session, with times in your time zone.`],
  ['video', 'Recordings', 'Every live session is recorded and streams in the portal, so you can catch up or watch again.'],
  ['folder', 'Assignments and feedback', 'Submit projects, see your rubric level and your instructorâ€™s written feedback, and resubmit when a project needs more work.'],
  ['chat', 'Notifications', 'Class reminders, new recordings and feedback on your work, gathered in one place.'],
];

const DASHBOARD = [
  ['pulse', 'Progress rings', 'How far you are through your term and your program, at a glance.'],
  ['spark', 'Learning streaks', 'Days in a row with real learning activity. You can switch streaks off.'],
  ['cert', 'Achievements and skill badges', 'Achievements for real milestones, such as your first project passed, and a skill badge for each term you master.'],
  ['gap', 'Skill gaps', 'The skills your career goal needs that you have not mastered yet, and the lessons that teach them.'],
  ['rocket', 'One next step', 'A single recommended action each time you sign in, worked out from your progress, with the reason shown.'],
];

const portal = () => html`
<section class="sec dark on-dark" id="portal" aria-labelledby="portal-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('layers')} Inside the student portal</span><h2 id="portal-title">${accent('Everything for your term in *one place*')}</h2>
      <p class="lede">The portal is where you watch lessons, join live sessions, download notes and briefs, submit projects and read feedback.</p></div></div>
    <ul class="how-feats">
      ${PORTAL.map(([ic, t, d]) => html`<li class="how-feat"><span class="how-fi">${icon(ic)}</span><h3>${t}</h3><p>${d}</p></li>`)}
    </ul>
    <section class="how-dash" aria-labelledby="dash-title">
      <div>
        <span class="chip gold how-status">${icon('check')} Built and tested</span>
        <h3 id="dash-title">${accent('Your personal *dashboard*')}</h3>
        <p class="muted">Your home page in the portal is a personal dashboard, worked out from your real progress and grades.</p>
      </div>
      <ul>${DASHBOARD.map(([ic, t, d]) => html`<li>${icon(ic)}<span><b>${t}</b>${d}</span></li>`)}</ul>
    </section>
  </div>
</section>`;

// ---------- assessment ----------
const assessment = () => html`
<section class="sec" id="assessment" aria-labelledby="assess-title">
  <div class="wrap how-gap">
    ${head({ id: 'assess-title', eyebrow: 'Assessment', title: 'How your work is *assessed*', lede: `Every term has ${NUM[PROJECTS]} projects, due in weeks ${DUE_WEEKS}. An instructor grades each one on a four-level mastery rubric and writes feedback.` })}
    ${rubric()}
    <div class="twocol">
      <div class="box"><h3>${icon('check')} Proficient or better passes</h3><p class="muted">Distinguished and Proficient are passing levels. Every graded project comes with written feedback from your instructor.</p></div>
      <div class="box"><h3>${icon('route')} Below that, resubmit</h3><p class="muted">Basic and Not yet mean the project needs more work. You get written feedback on what is missing, then revise and resubmit.</p></div>
      <div class="box"><h3>${icon('play')} Lessons count at 90%</h3><p class="muted">A lesson is complete when you have watched 90% of it, measured from the time you really watched.</p></div>
    </div>
  </div>
</section>`;

// ---------- credential ----------
const credential = () => html`
<section class="sec tinted" id="credential" aria-labelledby="cred-title">
  <div class="wrap">
    ${head({ id: 'cred-title', eyebrow: 'Credential', title: 'What you receive, *plainly*', lede: `Every program leads to a ${CREDENTIAL.short}. Here is exactly what that is, and what it is not.` })}
    <div class="twocol how-two">
      <div class="box"><h3>${icon('cert')} Certificate of completion</h3><p>Completing a program earns you a ${CREDENTIAL.short} for that program, issued by Nuvora.</p></div>
      <div class="box"><h3>${icon('info')} Not an accredited degree</h3><p>Nuvora is not an accredited university, and the certificate is not an accredited degree. Program names such as B.S. and M.S. describe the level and scope of study.</p></div>
      <div class="box"><h3>${icon('layers')} Credits describe workload</h3><p>Programs carry ${CREDITS[0]} to ${CREDITS[1]} Nuvora credits. Nuvora credits describe workload and may not transfer to universities.</p></div>
      <div class="box"><h3>${icon('x')} No transfer credit or test-outs</h3><p>Nuvora does not accept transfer credit or offer test-outs, so every learner takes every term of their program.</p></div>
    </div>
  </div>
</section>`;

// ---------- support ----------
const supportContact = () => (OWNER.supportEmail
  ? html`Write to <a href="mailto:${OWNER.supportEmail}">${OWNER.supportEmail}</a>${OWNER.supportHours ? html` (${OWNER.supportHours})` : ''}.`
  : html`Support contact details and hours will be published before the first batch. Until then, see the <a href="/contact/">contact page</a>.`);

const support = () => html`
<section class="sec" id="support" aria-labelledby="support-title">
  <div class="wrap split">
    <div class="how-gap">
      <div class="stack"><span class="eyebrow">${icon('users')} Support</span>
        <h2 id="support-title">${accent('You are never learning *alone*')}</h2>
        <p class="lede">People teach you, grade your work and notice when you go quiet.</p></div>
      <ul class="ticks how-support">
        <li>${icon('check')}<span><b>Instructors teach live and grade.</b> The instructors who run your ${SCHEDULE.classDay} class also grade your projects. ${OWNER.instructors.length ? '' : 'Their names and backgrounds will be published before the first batch.'}</span></li>
        <li>${icon('check')}<span><b>Weekly office hours.</b> Every ${SCHEDULE.officeDay} at ${SCHEDULE.officeTime} IST, ${SCHEDULE.officeMinutes} minutes on Jitsi, for questions about lessons and projects.</span></li>
        <li>${icon('check')}<span><b>A check-in when you go quiet.</b> If you have not been active for 14 days, you appear on your instructorâ€™s check-in list so they can reach out.</span></li>
      </ul>
      <div class="box"><h3>${icon('clock')} Planned: mentoring and success coaching</h3>
        <p class="muted">We plan to offer mentoring and success coaching to help you plan your weeks around work and life. It is not running yet, and the details will be published before the first batch.</p></div>
      <p class="note">${supportContact()}</p>
    </div>
    ${photo('mentor')}
  </div>
</section>`;

const body = (today) => html`
${pageHead({
    eyebrow: 'How it works',
    title: accent('How learning at Nuvora *works*'),
    lede: `Lessons you watch when it suits you, two live Jitsi sessions every week, and ${NUM[PROJECTS]} projects a term graded by instructors. Here is a term from start to finish, and the support around it.`,
    crumbs: CRUMBS,
    extra: html`<div class="row how-chips">
      <span class="chip frost">${icon('cal')} ${WEEKS}-week terms</span>
      <span class="chip frost">${icon('live')} 2 live sessions a week</span>
      <span class="chip frost">${icon('folder')} ${PROJECTS} graded projects a term</span></div>`,
  })}
<div class="how-page">
  <div class="jumpnav how-jump"><div class="wrap"><nav aria-label="On this page" data-jumpnav>${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav></div></div>
  ${learningSystem()}
  ${term(today)}
  ${portal()}
  ${assessment()}
  ${credential()}
  ${support()}
  <section class="sec tinted" id="faq" aria-labelledby="faq-title"><div class="wrap">
    ${head({ id: 'faq-title', eyebrow: 'Questions', title: 'How it works: *straight answers*' })}
    ${faqList(FAQ)}
  </div></section>
</div>
${ctaBand()}`;

export default function how({ today } = {}) {
  return [{
    path: PATH,
    html: page({
      path: PATH, today,
      title: 'How it works: 12-week terms, live classes and projects',
      description: `Each Nuvora term runs ${WEEKS} weeks: lessons on demand, a live Jitsi class and office hours every week, and ${NUM[PROJECTS]} instructor-graded projects with written feedback.`,
      body: body(today),
      schema: [breadcrumbList(CRUMBS), faqPage(FAQ)],
      scripts: ['/js/how.js'],
      styles: ['/css/how.css'],
    }),
  }];
}
