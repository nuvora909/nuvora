import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page } from '../lib/layout.mjs';
import { sectionHead, programCatalog, proofSection, careerLadder, finder, factsBand, schedule, weekView, faqList, ctaBand, foundingPanel, photo } from '../lib/components.mjs';
import { faqPage, itemList } from '../lib/schema.mjs';
import { PROGRAMS, TOPICS, TUITION, money } from '../data/programs.mjs';
import { SITE, FAQ, CLIPS, PHOTOS, SCHEDULE } from '../data/site.mjs';

const slugTopic = (t) => t.toLowerCase().replace(/\s+/g, '-');

const hero = () => html`
<section class="hero on-dark" aria-labelledby="hero-title">
  <div class="vstage" aria-hidden="true" data-video data-clips="${JSON.stringify(CLIPS.map(({ src, from, dur }) => ({ src, from, dur })))}">
    <img class="on" src="${PHOTOS.group.src}" alt="" fetchpriority="high" decoding="async" style="object-position:${PHOTOS.group.pos}">
  </div>
  <div class="wrap hero-in">
    <div class="hero-copy">
      <span class="eyebrow">${icon('spark')} Data science &amp; AI programs · online</span>
      <h1 id="hero-title">${accent('Build the skills your next *career* demands.')}</h1>
      <p class="lede">Programs in data science, machine learning and generative AI, taught in 12-week terms. Watch lessons when it suits you, join two live Jitsi sessions a week, and prove what you can do with projects graded by instructors.</p>
      <div class="hero-facts">
        <span class="chip frost">${icon('cal')} Starts the first Monday of every month</span>
        <span class="chip frost">${icon('live')} 2 live sessions a week</span>
        <span class="chip frost">${icon('coin')} From ${money(TUITION.perTerm.Certificate)} per term</span>
      </div>
      <div class="hero-ctas">
        <a class="btn primary" href="#find" data-cta="hero-find">Find my program ${icon('down')}</a>
        <a class="btn ghost" href="/programs/" data-cta="hero-programs">Browse programs</a>
        <a class="btn ghost" href="/learn/sample-lesson/" data-cta="hero-sample">${icon('play')} Try a sample lesson</a>
      </div>
    </div>
  </div>
  <div class="vbar">
    <button class="vbtn" type="button" data-video-toggle aria-pressed="false" hidden>${icon('pause')}<span>Pause video</span></button>
    <span class="stocklabel">Stock media · not Nuvora students</span>
  </div>
</section>`;

// The catalog, after the owner's reference: an intro column, topic tabs, picture cards and "Show N more".
const programs = () => html`
<section class="sec" id="programs" aria-labelledby="programs-title">
  <div class="wrap">
    ${programCatalog({ id: 'home-catalog', limit: 3, intro: {
      id: 'programs-title', eyebrow: 'Programs', title: 'Build the skills employers *hire for*',
      text: `${PROGRAMS.length} programs in data science, machine learning, generative AI and MLOps, each mapped to the skills data and AI roles use. All of them run in 12-week terms, with lessons you watch any time, two live Jitsi sessions a week and projects graded by instructors.`,
    } })}
    <p class="row small muted ccat-topics">Browse by topic:
      ${TOPICS.map((t) => html`<a class="chip blue" href="/learn/${slugTopic(t)}/">${t}</a>`)}</p>
  </div>
</section>`;

// Find my program, right after the certificates: four questions, then the match with its reasons.
const find = () => html`
<section class="sec tinted" id="find" aria-labelledby="find-title">
  <div class="wrap find-split">
    <div class="find-copy">
      ${sectionHead({ id: 'find-title', eyebrow: html`${icon('target')} Find my program`, title: 'Not sure which program *fits*?', lede: 'Answer four quick questions about your background, your goal and the time you have each week. You get your best match with the reasons, then your term-by-term learning path with dates and costs.' })}
      <a class="link" href="/find-your-program/">Open the full planner ${icon('arrow')}</a>
    </div>
    ${finder({ id: 'home-finder', compact: true })}
  </div>
</section>`;

const careers = () => html`
<section class="sec dark on-dark" id="careers" aria-labelledby="careers-title">
  <div class="wrap">
    <div class="shead">
      <div><span class="eyebrow">${icon('ladder')} Career pathways</span><h2 id="careers-title">${accent('Where can this *take you*?')}</h2>
        <p class="lede">Data and AI careers grow step by step. Pick a track, then open a role to see the skills it needs and the programs that teach them.</p></div>
      <a class="link" href="/careers/">Explore the skills required for each role ${icon('arrow')}</a>
    </div>
    ${careerLadder()}
  </div>
</section>`;

const pillar = ({ n, title, lede, points, photoKey, glass }) => html`
<article class="pillar on-dark">
  <div class="copy">
    <span class="pk">${n}</span>
    <h3>${accent(title)}</h3>
    <p>${lede}</p>
    <ul>${points.map((p) => html`<li>${icon('check')}<span>${p}</span></li>`)}</ul>
  </div>
  <div class="vis">${photo(photoKey, { cls: 'ph' })}${glass}</div>
</article>`;

const learningSystem = () => html`
<section class="sec tinted" id="learning-system" aria-labelledby="ls-title">
  <div class="wrap">
    <div class="shead center"><div><span class="eyebrow">How you learn</span><h2 id="ls-title">${accent('The Nuvora *Learning System*')}</h2>
      <p class="lede">Three ideas shape every program: learning that adapts to you, mastery you prove with real work, and people who keep you moving.</p></div></div>
    <div class="pillars">
      ${pillar({ n: '01', title: 'Learn *smarter*', photoKey: 'home',
        lede: 'Your portal home is built around you: your learning path term by term with its dates, progress counted from what you have actually watched and submitted, and one next step with the reason for it.',
        points: ['A learning path with every term and its dates', 'Progress measured from real watch time, not clicks', 'Skill gaps for your career goal, with the lessons that close them'],
        glass: html`<div class="floatcard g1"><span class="ex">Example screen</span><b>Your learning path</b><div class="mini-bar"><i style="width:18%"></i></div><span>Term 2 of 12 · 18% of lessons complete</span></div>
          <div class="floatcard g2"><span class="ex">Next step</span><b>Model evaluation &amp; validation</b><span>Keep going: you are 60% of the way through this lesson.</span></div>` })}
      ${pillar({ n: '02', title: 'Prove *mastery*', photoKey: 'duo',
        lede: 'Competency is shown, not assumed. Every term has three projects assessed by instructors against a four-level rubric. Proficient or better passes; below that you get written feedback and resubmit.',
        points: ['Three graded projects every term, ending in a capstone', 'A skill badge for each term you master: every lesson complete and all three projects passed', 'Written feedback on every submission'],
        glass: html`<div class="floatcard g1"><span class="ex">Mastery rubric</span><div class="rub"><div><span>Distinguished</span><i style="width:100%"></i></div><div><span>Proficient</span><i style="width:78%"></i></div><div><span>Basic</span><i style="width:46%"></i></div><div><span>Not yet</span><i style="width:20%"></i></div></div></div>` })}
      ${pillar({ n: '03', title: 'Stay *supported*', photoKey: 'mentor',
        lede: 'Instructors teach live and grade your work, and office hours run every week. Mentoring and success coaching are planned; what they include will be published before the first batch.',
        points: [`Live class every ${SCHEDULE.classDay} and office hours every ${SCHEDULE.officeDay}`, 'Instructors who teach your classes and grade your projects', 'After 14 days without activity, you appear on your instructor’s check-in list'],
        glass: html`<div class="floatcard g2"><span class="ex">This week</span><b>Office hours · ${SCHEDULE.officeDay}</b><span>${SCHEDULE.officeTime} IST · ${SCHEDULE.officeMinutes} min on Jitsi</span></div>` })}
    </div>
  </div>
</section>`;

const STEPS = [
  ['chat', 'Tell us about you', 'Four questions about your background, goal and weekly time.', 'Find my program'],
  ['target', 'Get matched', 'A recommended program with a match score and the reasons behind it.', 'Explained, rule-based'],
  ['route', 'Get your learning path', 'Every term with dates, weekly hours and the projects you will build.', 'From the program plan'],
  ['pulse', 'Track your progress', 'Watch time, live attendance and grades, together in the portal.', 'Real portal data'],
  ['gap', 'See your skill gaps', 'The skills your goal role needs that you have not mastered yet.', 'Mapped to your goal'],
  ['rocket', 'Know your next step', 'One clear action each time you sign in, with the reason for it.', 'Updated as you learn'],
];

const connected = () => html`
<section class="sec dark on-dark" id="experience" aria-labelledby="exp-title">
  <div class="wrap">
    <div class="shead"><div><span class="eyebrow">${icon('spark')} One connected experience</span><h2 id="exp-title">${accent('From your first answer to your *next step*')}</h2>
      <p class="lede">Each step feeds the next, so the advice you get is always based on where you really are.</p></div>
      <button class="btn ghost" type="button" data-advisor-open hidden>${icon('spark')} Ask the advisor</button></div>
    <ol class="flow">${STEPS.map(([ic, t, d, how]) => html`<li class="rv"><span class="fi">${icon(ic)}</span><b>${t}</b><p>${d}</p><span class="how">${how}</span></li>`)}</ol>
    <div class="hotspot-demo" data-hotspots>
      <span class="chip gold tag">Example screen · sample data</span>
      <div class="hs-card"><button class="hs" type="button" aria-expanded="false" aria-controls="hs1" aria-label="What is the learning path ring?">1</button>
        <b>Your learning path</b><div class="row"><span class="ring-sm" style="--v:18" role="img" aria-label="18% of the program complete"><b>18%</b></span><span>Term 2 of 12<br>Goal: ML Engineer</span></div>
        <p class="hs-tip" id="hs1" hidden>The share of all lessons in your program you have completed. A lesson counts once you have watched 90% of it.</p></div>
      <div class="hs-card"><button class="hs" type="button" aria-expanded="false" aria-controls="hs2" aria-label="How do streaks work?">2</button>
        <b>Learning streak</b><span>${icon('spark')} 6 days · a single rest day never breaks it</span><span class="muted" style="color:var(--on-deep-muted)">You can turn streaks off at any time.</span>
        <p class="hs-tip" id="hs2" hidden>Days with real learning activity in a row: watching lessons, submitting projects or attending class. One rest day between active days keeps the streak going, and streaks can be switched off in your profile.</p></div>
      <div class="hs-card"><button class="hs" type="button" aria-expanded="false" aria-controls="hs3" aria-label="What is the next step?">3</button>
        <b>Next step</b><span>Revise and resubmit Project 2</span><span class="muted" style="color:var(--on-deep-muted)">Your instructor reviewed it and asked for a revision.</span>
        <p class="hs-tip" id="hs3" hidden>One recommended action, chosen in a fixed order: work to revise or past its due date, a live class within 24 hours, the lesson you are in, the next lesson, a project due this week, then a lesson for your goal.</p></div>
    </div>
  </div>
</section>`;

const batch = () => html`
<section class="sec" id="how" aria-labelledby="how-title">
  <div class="wrap stack" style="gap:24px">
    ${sectionHead({ id: 'how-title', eyebrow: 'How a term runs', title: 'Flexible lessons, *live* every week', lede: `Each term is a 12-week batch that starts on the first Monday of a month. Here is a typical week, with times shown in US Eastern Time (ET) and your own time zone.`, action: html`<a class="link" href="/how-it-works/">How it works ${icon('arrow')}</a>` })}
    ${weekView()}
    ${schedule()}
  </div>
</section>`;

const body = () => html`
${hero()}
${factsBand()}
${programs()}
${proofSection()}
${find()}
${careers()}
${learningSystem()}
${connected()}
${batch()}
<section class="sec tight"><div class="wrap">${foundingPanel()}</div></section>
<section class="sec" id="faq" aria-labelledby="faq-title"><div class="wrap">
  ${sectionHead({ id: 'faq-title', eyebrow: 'Questions', title: 'Straight *answers*' })}
  ${faqList(FAQ)}
</div></section>
${ctaBand()}`;

export default function home({ today } = {}) {
  return [{
    path: '/',
    html: page({
      path: '/', today,
      title: 'Nuvora · Data science and AI programs, taught live online',
      description: SITE.description,
      body: body(),
      schema: [faqPage(FAQ), itemList(PROGRAMS.map((p) => [p.url, p.name]))],
      scripts: ['/js/find.js', '/js/home.js'],
    }),
  }];
}
