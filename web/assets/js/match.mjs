// "Find my program": a transparent, rule-based match between a visitor's answers and the programs.
// Pure functions with no DOM access, used by the browser and by the Node tests.
//
// The match score is calculated, not predicted: goal fit (40) + background fit (25) + prerequisites (15) +
// weekly time (20) = 100. Every point is explained to the visitor. Master's-level programs are never offered
// to someone who says they have no bachelor's degree, and someone who has never coded is always matched first
// to a program that teaches Python from the start.

export const QUESTIONS = [
  { id: 'role', q: 'What describes you?', options: [
    ['student', 'Iâ€™m a student'], ['tech', 'I work in tech'], ['nontech', 'I work outside tech'],
    ['manager', 'I manage people or projects'], ['changer', 'Iâ€™m changing careers'], ['growth', 'Iâ€™m learning for personal growth']] },
  { id: 'goal', q: 'Whatâ€™s your main goal?', options: [
    ['promoted', 'Get promoted'], ['switch', 'Change careers'], ['ai', 'Build AI skills'],
    ['degree', 'Get a degree'], ['stronger', 'Become technically stronger']] },
  { id: 'hours', q: 'How much time can you give each week?', options: [
    ['3-5', '3â€“5 hours'], ['5-10', '5â€“10 hours'], ['10+', '10+ hours']] },
  { id: 'coding', q: 'Have you written code before?', options: [
    ['none', 'Not yet'], ['some', 'A little'], ['regular', 'Yes, regularly']] },
];
export const BACHELOR_Q = { id: 'bachelor', q: 'Masterâ€™s-level programs need a bachelorâ€™s degree. Do you have one?', options: [['yes', 'Yes'], ['no', 'No, not yet']] };

export const label = (qid, value) => [...QUESTIONS, BACHELOR_Q].find((q) => q.id === qid)?.options.find(([v]) => v === value)?.[1] ?? '';

const GOAL_FIT = {
  promoted: { 'ms-ds': 40, 'ms-aml': 36, 'c-genai': 30, 'c-mlops': 30, 'c-py': 26, 'bs-ds': 18, 'bs-aiml': 18 },
  switch: { 'bs-ds': 38, 'bs-aiml': 38, 'c-py': 34, 'ms-ds': 26, 'ms-aml': 26, 'c-genai': 22, 'c-mlops': 22 },
  ai: { 'c-genai': 40, 'bs-aiml': 36, 'ms-aml': 34, 'c-mlops': 26, 'c-py': 18, 'bs-ds': 18, 'ms-ds': 18 },
  degree: { 'bs-aiml': 36, 'bs-ds': 36, 'ms-aml': 34, 'ms-ds': 34, 'c-py': 12, 'c-genai': 12, 'c-mlops': 12 },
  stronger: { 'c-mlops': 38, 'ms-aml': 36, 'c-genai': 32, 'bs-aiml': 30, 'c-py': 28, 'bs-ds': 26, 'ms-ds': 26 },
};
const ROLE_FIT = {
  student: { 'bs-ds': 25, 'bs-aiml': 25, 'c-py': 20, 'c-genai': 12, 'ms-ds': 14, 'ms-aml': 14, 'c-mlops': 8 },
  tech: { 'c-mlops': 25, 'ms-aml': 25, 'c-genai': 22, 'ms-ds': 18, 'bs-aiml': 15, 'c-py': 10, 'bs-ds': 10 },
  nontech: { 'c-py': 25, 'bs-ds': 22, 'bs-aiml': 16, 'ms-ds': 14, 'c-genai': 10, 'c-mlops': 6, 'ms-aml': 6 },
  manager: { 'ms-ds': 25, 'c-genai': 20, 'c-py': 18, 'ms-aml': 14, 'bs-ds': 12, 'bs-aiml': 10, 'c-mlops': 8 },
  changer: { 'bs-ds': 24, 'c-py': 24, 'bs-aiml': 22, 'ms-ds': 14, 'c-genai': 12, 'c-mlops': 8, 'ms-aml': 8 },
  growth: { 'c-py': 25, 'c-genai': 22, 'bs-ds': 14, 'bs-aiml': 14, 'c-mlops': 12, 'ms-ds': 10, 'ms-aml': 10 },
};
const FOCUS = {
  'bs-ds': 'statistics, Python, SQL, experiments and dashboards',
  'bs-aiml': 'machine learning, deep learning, LLM systems and MLOps',
  'ms-aml': 'production machine learning, deep learning architectures and responsible AI',
  'ms-ds': 'advanced statistics, experimentation and analytics leadership',
  'c-py': 'Python, SQL and data analysis',
  'c-genai': 'building LLM applications with prompting, retrieval, agents and evaluation',
  'c-mlops': 'data pipelines, orchestration, model serving and monitoring',
};
const ROLE_TEXT = {
  student: 'It suits students: it builds from the foundations up.',
  tech: 'It builds on the technical experience you already have.',
  nontech: 'It is designed for people coming from outside tech.',
  manager: 'It suits people who lead work and make decisions with data.',
  changer: 'It is designed for career changers, with a portfolio of graded projects.',
  growth: 'It is a focused way to learn without committing to a long program.',
};
const MAX = { goal: 40, role: 25, prereq: 15, time: 20 };

function timeFit(hours, min) {
  if (hours === '10+') return 20;
  if (hours === '5-10') return min <= 8 ? 14 : 8;
  return 4;
}

function prereqFit(p, coding) {
  if (!p.requiresCoding) return 15;
  return coding === 'regular' ? 15 : coding === 'some' ? 7 : 0;
}

// Score one program. Returns null when the program is not open to this person (no bachelor's for a Master's).
export function scoreProgram(p, a) {
  if (p.needsBachelor && a.bachelor === 'no') return null;
  const parts = {
    goal: GOAL_FIT[a.goal]?.[p.id] ?? 0,
    role: ROLE_FIT[a.role]?.[p.id] ?? 0,
    prereq: prereqFit(p, a.coding),
    time: timeFit(a.hours, p.weeklyMin),
  };
  const score = parts.goal + parts.role + parts.prereq + parts.time;
  const reasons = [];
  const cautions = [];
  const goalText = {
    promoted: `You want a promotion: it deepens ${FOCUS[p.id]}, skills you can use in your current role.`,
    switch: `You want to change careers: it teaches ${FOCUS[p.id]}, with ${p.projects} graded projects for your portfolio.`,
    ai: `You want AI skills: it covers ${FOCUS[p.id]}.`,
    degree: `You want degree-level study: it is a ${p.levelLabel.toLowerCase()} of ${p.termCount} ${p.termCount === 1 ? 'term' : 'terms'}.`,
    stronger: `You want to get technically stronger: it is hands-on ${FOCUS[p.id]}.`,
  }[a.goal];
  if (goalText && parts.goal >= 26) reasons.push(goalText);
  if (parts.role >= 20) reasons.push(ROLE_TEXT[a.role]);
  if (!p.requiresCoding) reasons.push(a.coding === 'none' ? 'No coding experience needed: the first term teaches Python.' : 'Your coding experience is enough: the first term starts with Python.');
  else if (a.coding === 'regular') reasons.push('You already code regularly, which this program expects.');
  else cautions.push(a.coding === 'some'
    ? 'It expects confident Python. If you are unsure, start with the Certificate in Python & Data Analysis.'
    : 'It needs Python first. The Certificate in Python & Data Analysis is the place to start.');
  if (p.needsBachelor && a.bachelor === 'yes') reasons.push('You have a bachelorâ€™s degree, which masterâ€™s-level programs require.');
  if (parts.time === 20) reasons.push(`It fits your ${label('hours', a.hours)} a week: plan for about ${p.weeklyHours} hours.`);
  else if (parts.time >= 14) reasons.push(`It can work with ${label('hours', a.hours)} a week if you can give at least ${p.weeklyMin}: plan for ${p.weeklyHours} hours.`);
  else cautions.push(`Plan for about ${p.weeklyHours} hours a week, more than the ${label('hours', a.hours)} you have now.`);
  if (a.goal === 'degree') cautions.push('Nuvora awards a certificate of completion, not an accredited degree.');
  return { id: p.id, score, parts, reasons, cautions };
}

/**
 * @param answers {role, goal, hours, coding, bachelor?}
 * @param programs the program list (web/data/programs.mjs PROGRAMS or the browser catalog)
 * @returns {match, alternatives, needs, ranked} â€” needs is 'bachelor' when the best fit is a Master's-level
 *          program and we have not asked about a degree yet.
 */
export function recommend(answers, programs) {
  // Someone who has not coded yet is matched first to the programs that teach Python from the start; programs
  // that expect code follow, whatever their score, each with the caution that says to learn Python first.
  const order = (id) => programs.findIndex((p) => p.id === id);
  const later = (id) => (answers.coding === 'none' && programs.find((p) => p.id === id).requiresCoding ? 1 : 0);
  const ranked = programs.map((p) => scoreProgram(p, answers)).filter(Boolean)
    .sort((x, y) => later(x.id) - later(y.id) || y.score - x.score || order(x.id) - order(y.id));
  const top = ranked[0];
  const topProgram = programs.find((p) => p.id === top.id);
  const needs = topProgram.needsBachelor && !answers.bachelor ? 'bachelor' : null;
  return { match: top, alternatives: ranked.slice(1, 3), needs, ranked };
}

export const isComplete = (a) => QUESTIONS.every((q) => a[q.id]);
export const MAX_PARTS = MAX;
