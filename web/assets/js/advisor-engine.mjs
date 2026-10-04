// The advisor's answers. Two honest modes:
// - AI mode, only where an AI model is actually connected (the Claude artifact runtime, or a configured server
//   endpoint): the model answers from the catalog facts below under strict rules.
// - Catalog mode everywhere else: rule-based answers built directly from the published catalog, labelled as such.
// Answers are a tiny markdown subset: paragraphs, "- " bullets, **bold** and [links](/site-paths-only).
import { nextStarts, fmtDay } from './dates.mjs';
import { ACCESS_RULE } from './access-rule.mjs';

// Prices are launch pricing in US dollars, written as on the pages ("$1,950").
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const level = (C, lvl) => C.programs.find((p) => p.level === lvl).tuition.perTerm;
const SUPPORT_LATER = 'Support contact details will be published before the first batch.';

export function aiAvailable() {
  return typeof globalThis.window?.claude?.complete === 'function';
}

// ---------- catalog facts (also the AI's only source) ----------
export function catalogText(C, today) {
  const [next, after] = nextStarts(2, today);
  const s = C.schedule;
  return [
    `Status: pre-launch. No batch has run yet: there are no graduates, reviews, ratings, completion rates, job placements, salary data or employer partners.`,
    `Credential: a Nuvora certificate of completion. Not an accredited degree; B.S./M.S. names describe level and scope. Nuvora credits describe workload and may not transfer. No transfer credit or test-outs.`,
    `Format: each term is a 12-week batch starting on the first Monday of a month. Lessons on demand in the portal; live ${s.classMinutes}-minute class on ${s.classDay}s and ${s.officeMinutes}-minute office hours on ${s.officeDay}s at ${s.classTime} IST (Asia/Kolkata) on Zoom, recorded. Videos stream only and are never downloadable; lesson notes and project briefs are downloadable PDFs.`,
    `Assessment: 3 instructor-graded projects per term on a 4-level rubric (Distinguished, Proficient, Basic, Not yet). Proficient or better passes; otherwise written feedback and resubmission. A lesson completes at 90% watched.`,
    `Dates: next start ${fmtDay(next.start)} (seat requests close ${fmtDay(next.applyBy)}); then ${fmtDay(after.start)}. Requests close 7 days before a start.`,
    `Tuition: launch pricing in US dollars (USD), paid one term at a time, plus a one-time ${money(C.programs[0].tuition.applicationFee)} application fee. No loans or scholarships yet. Refund policy to be published before the first batch.`,
    `Unpaid terms: ${ACCESS_RULE}`,
    ...C.programs.map((p) => `Program ${p.name} (${p.url}): ${p.levelLabel}; ${p.duration}; ${p.termCount} terms; ${p.weeklyHours} hours/week; ${money(p.tuition.perTerm)} per term, ${money(p.tuition.total)} total; ${p.projects} graded projects; needs: ${p.required.join('; ')}; ${p.tagline} Career paths: ${p.roles.map((r) => C.roles[r].title).join(', ')}.`),
    `Contact: ${SUPPORT_LATER} Before launch, people reach Nuvora through the seat request form and get a reply by email.`,
    `Useful pages: /find-your-program/ (matcher), /programs/ (compare), /careers/ (roles and skills), /how-it-works/, /tuition/, /admissions/ (start dates, request a seat), /learn/sample-lesson/, /about/, /legal/privacy/.`,
  ].join('\n');
}

export const AI_RULES = `You are the Nuvora advisor on Nuvora's website. Answer questions about Nuvora's programs using ONLY the facts provided.
Rules:
- Nuvora is pre-launch. Always be plain about it: there are no graduates, reviews, ratings, outcomes, placements, salaries or partners. Never invent any.
- Nuvora awards a certificate of completion, not an accredited degree. Never call it a degree or say credits transfer.
- Never promise jobs, promotions or salaries.
- Never suggest a master's-level program to someone who says they do not have a bachelor's degree.
- If you do not know, say so and point to a page. Do not ask for or repeat personal information.
- Keep answers under 120 words. Use short paragraphs or "- " bullets, **bold** sparingly, and markdown links only to the site paths listed.`;

// ---------- catalog mode ----------
// What a question is about. Short words (fee, emi, price, cost, pay) match whole words only, so "coffee",
// "academic" or "priceless" do not count. A program name such as "the GenAI certificate" is not a question about
// the credential: only words about accreditation, degrees, credits or what certificate you receive are.
const INTENT = {
  hello: /\b(hi|hello|hey|namaste)\b/,
  credential: /accredit|recogni[sz]ed|real degree|(?<!bachelor[’']?s )\bdegree\b|credential|\btransfer|\bcredits?\b|certificate (of completion|do i get|will i get)|(what|which|kind of|type of) certificate|(get|receive|earn) a certificate/,
  download: /download|offline|save (the )?videos?|\brecord(ing)?s?\b/,
  price: /\b(prices?|pricing|costs?|fees?|tuition|afford(able)?|expensive|cheap|loans?|scholarships?|emis?|instal+ments?)\b|how much\b.*\bpay\b/,
  payment: /\b(pay|paid|paying|payments?|unpaid|overdue)\b|\bpaus(e|ed)\b|\blose (my )?access\b|\baccess (stops?|ends?)\b/,
  refund: /refund|cancel|defer|money back/,
  dates: /when.*\b(start|begin)|start date|next (batch|start|intake)|intake|deadline|apply by|\bclos(e|es|ing)\b/,
  live: /\blive\b|zoom|\bclass(es)?\b|schedule|timing|time ?zone|office hours|weekday|weekend/,
  hours: /(?<!office )\bhours\b|how much time|per week|workload|part[- ]time|full[- ]time|\bbusy\b|job and study|around (a|my) job/,
  prereq: /prereq|requirements?|need to know|do i need|need for|beginner|no (coding|experience)|never coded|\bmaths?\b|eligib|qualif/,
  assess: /assess|\bgrad(e|ed|es|ing)\b|\bexams?\b|rubric|\btest|\bpass(ed|es|ing)?\b|\bfail/,
  outcome: /(?<!around (a|my) )\bjobs?\b|placement|\bplaced\b|salar(y|ies)|guarantee|\bhir(e|ed|ing)\b|employ|outcome|reviews?|ratings?|graduat|success rate|alumni|partner|percentage/,
  which: /which|recommend|right for me|\bbest\b|should i|confused|suggest|switch|career change|change careers|for me/,
  human: /\btalk\b|human|\bcall\b|contact|counsel|e-?mail|phone|whatsapp|\bsupport\b/,
};
const has = (q, name) => INTENT[name].test(q);
const programIn = (q, C) => {
  const names = [
    ['c-genai', /gen(erative)?\s*ai|llm|rag\b|agents?\b|prompt/],
    ['c-mlops', /mlops|data engineer|pipeline|airflow|deploy/],
    ['c-py', /python (and|&) data|python certificate|certificate in python/],
    ['ms-aml', /m\.?s\.? (in )?applied|applied machine learning/],
    ['ms-ds', /m\.?s\.? (in )?data science|data science (&|and) analytics|analytics master/],
    ['bs-aiml', /b\.?s\.? (in )?(ai|artificial)|bachelor.*(ai|machine learning)/],
    ['bs-ds', /b\.?s\.? (in )?data science|bachelor.*data science/],
  ];
  const hit = names.find(([, re]) => re.test(q));
  return hit ? C.programs.find((p) => p.id === hit[0]) : null;
};

export function catalogAnswer(question, C, today) {
  const q = ` ${String(question).toLowerCase()} `;
  const [next] = nextStarts(1, today);
  const s = C.schedule;
  const p = programIn(q, C);
  const out = [];

  if (has(q, 'hello') && q.trim().split(/\s+/).length <= 3) {
    return 'Hi! I answer from Nuvora’s published catalog: programs, dates, tuition, schedule, credential and careers. What would you like to know?';
  }
  if (has(q, 'credential')) {
    out.push('Nuvora awards a **Nuvora certificate of completion**, not an accredited degree. Program names like B.S. and M.S. describe the level and scope of study. Nuvora credits describe workload and may not transfer, and Nuvora does not accept transfer credit. [Read more](/how-it-works/#credential)');
  }
  if (has(q, 'download')) {
    out.push('Lessons and class recordings **stream in the student portal only** and can’t be downloaded. Lesson notes, exercise sheets and project briefs are PDFs you can download.');
  }
  if (has(q, 'price')) {
    if (p) out.push(`The **${p.name}** costs ${money(p.tuition.perTerm)} per 12-week term${p.termCount > 1 ? ` × ${p.termCount} terms = ${money(p.tuition.total)}` : ''}, plus a one-time ${money(p.tuition.applicationFee)} application fee. You pay one term at a time. [Tuition details](/tuition/)`);
    else out.push(`Launch pricing in US dollars, paid one term at a time:\n- Certificates and bachelor’s-level: ${money(level(C, 'Bachelor'))} per 12-week term\n- Master’s-level: ${money(level(C, 'Master'))} per term\n- Application fee: ${money(C.programs[0].tuition.applicationFee)}, once\nLoans and scholarships aren’t offered yet. [Tuition details](/tuition/)`);
  }
  if (has(q, 'payment')) {
    out.push(`${ACCESS_RULE} [Paying for tuition](/tuition/#paying)`);
  }
  if (has(q, 'refund')) {
    out.push('The refund and deferral policy will be published before the first batch, and you’ll see it before you pay anything. [Tuition](/tuition/#refunds)');
  }
  if (has(q, 'dates')) {
    out.push(`Batches start on the first Monday of every month. The next start is **${fmtDay(next.start)}**, and seat requests for it close on ${fmtDay(next.applyBy)}. [Start dates](/admissions/)`);
  }
  if (has(q, 'live')) {
    out.push(`Each week has a live ${s.classMinutes}-minute class on **${s.classDay}s** and ${s.officeMinutes}-minute office hours on **${s.officeDay}s**, both at ${s.classTime} India time (IST) on Zoom. Sessions are recorded, and lessons can be watched any time. [How it works](/how-it-works/)`);
  }
  if (has(q, 'hours')) {
    if (p) out.push(`Plan for about **${p.weeklyHours} hours a week** for the ${p.name}.`);
    else out.push(`Plan for ${C.programs.map((x) => `${x.short}: ${x.weeklyHours} h`).join(' · ')} a week. Lessons are on demand and live sessions are recorded, so you can study around a job.`);
  }
  if (has(q, 'prereq')) {
    if (p) out.push(`For the **${p.name}** you need: ${p.required.join('; ')}.`);
    else out.push('No coding experience is needed for the certificates in Python, the B.S. Data Science or the B.S. AI & Machine Learning: they teach Python from the start. The master’s-level programs need a bachelor’s degree, Python and some maths.');
  }
  if (has(q, 'assess')) {
    out.push('Each term has three projects graded by instructors on a four-level rubric: Distinguished, Proficient, Basic and Not yet. Proficient or better passes; below that you get written feedback and resubmit.');
  }
  if (has(q, 'outcome')) {
    out.push('Nuvora is **pre-launch**: there are no graduates, reviews or job outcomes yet, and we don’t guarantee jobs, promotions or salaries. We’ll publish real results with how they were measured after our first batches. [How we report results](/about/#outcomes)');
  }
  const role = Object.entries(C.roles).find(([, r]) => q.includes(r.title.toLowerCase().replace(/ \/ /g, '/')) || q.includes(r.title.toLowerCase()));
  if (role) {
    const [id, r] = role;
    out.push(`**${r.title}:** ${r.summary}\nKey skills: ${r.skills.map(([sk]) => sk).join(', ')}.\n[See the skills and programs for this role](/careers/${id}/)`);
  }
  if (p && !out.length) {
    out.push(`**${p.name}** (${p.levelLabel}): ${p.tagline}\n- ${p.duration}, about ${p.weeklyHours} hours a week\n- ${p.projects} graded projects\n- ${money(p.tuition.perTerm)} per term\n[View the program](${p.url})`);
  }
  if (has(q, 'which') && !out.length) {
    out.push('The quickest way is **Find my program**: four questions, then a match with the reasons and your learning path. [Find my program](/find-your-program/)');
  }
  if (has(q, 'human')) {
    out.push(`You can request a seat and we’ll reply by email to talk through the next steps. ${SUPPORT_LATER} [Request a seat](/admissions/#request)`);
  }
  if (out.length) return out.join('\n\n');
  return 'I can answer from our published catalog about programs, start dates, tuition, the live schedule, the credential and careers. Try asking “How much is the GenAI certificate?” or use [Find my program](/find-your-program/).';
}

// ---------- AI mode ----------
export async function aiAnswer(history, C) {
  const convo = history.slice(-8).map((m) => `${m.who === 'me' ? 'Visitor' : 'Advisor'}: ${m.text}`).join('\n');
  const prompt = `${AI_RULES}\n\nFacts:\n${catalogText(C)}\n\nConversation:\n${convo}\nAdvisor:`;
  const reply = await globalThis.window.claude.complete(prompt);
  return String(reply ?? '').trim().slice(0, 2000);
}

// ---------- safe rendering of the markdown subset ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function inline(text) {
  let s = esc(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  // Links only to this site's own pages: a path that starts with exactly one "/". "//host" and "/\host" are
  // other sites to a browser, so they stay plain text.
  s = s.replace(/\[([^\]]+)\]\((\/(?![/\\])[a-z0-9\-/#?=&;.]*)\)/gi, (_, label, href) => `<a href="${href}">${label}</a>`);
  return s;
}
// A block is split into runs of "- " bullets and runs of text, kept in their original order.
export function renderAnswer(md) {
  return String(md).split(/\n{2,}/).map((block) => {
    const runs = [];
    for (const line of block.split('\n')) {
      const bullet = line.startsWith('- ');
      const last = runs[runs.length - 1];
      if (last && last.bullet === bullet) last.lines.push(line);
      else runs.push({ bullet, lines: [line] });
    }
    return runs.map(({ bullet, lines }) => (bullet
      ? `<ul>${lines.map((b) => `<li>${inline(b.slice(2))}</li>`).join('')}</ul>`
      : `<p>${lines.map(inline).join('<br>')}</p>`)).join('');
  }).join('');
}
