// Facts for the program guide (/programs/<slug>/guide/) and the page-by-page brochure (/programs/<slug>/brochure/).
// Everything here is derived from the site's data modules (scripts/catalog.mjs through web/data), so the guide and
// the brochure always say what the program page, the tuition page and the admissions page say. Nothing is typed in
// twice: a price, a term, a lesson or a project changes in the catalog and both pages follow on the next build.
import { PROGRAMS, PACE, CREDENTIAL, money } from '../data/programs.mjs';
import { SCHEDULE, OWNER, RUBRIC } from '../data/site.mjs';
import { ROLES, CAREER_NOTE } from '../data/careers.mjs';
import { CERT_DISCLAIMER, CHECKED, certsFor } from '../data/certs.mjs';

export { PROGRAMS, PACE, CREDENTIAL, SCHEDULE, RUBRIC, CAREER_NOTE, CERT_DISCLAIMER, money };

/** The credential line, word for word as the site states it everywhere. */
export const CREDENTIAL_LINE = 'Nuvora certificate of completion · not an accredited degree';

export const guideUrl = (p) => `${p.url}guide/`;
export const brochureUrl = (p) => `${p.url}brochure/`;
export const requestUrl = (p) => `/admissions/?program=${p.id}#request`;
export const heroImage = (p) => ({ src: `/img/guides/${p.slug}-hero.jpg`, width: 1200, height: 1050, alt: `3D illustration of the ${p.name} program guide` });
export const motifImage = (p) => ({ src: `/img/guides/${p.slug}-motif.jpg`, width: 1200, height: 675 });

// ---------------------------------------------------------------- small helpers
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The week of a 12-week term that a catalog day falls in (day 18 is in week 3). */
export const weekOf = (day) => Math.ceil(day / 7);
/** A program name split so its last word can take the gold serif italic: ["B.S. Data ", "Science"]. */
export function nameParts(name) {
  const i = name.lastIndexOf(' ');
  return i < 0 ? ['', name] : [name.slice(0, i + 1), name.slice(i + 1)];
}
const LEVEL_KICKER = { Bachelor: 'Bachelor’s-level program', Master: 'Master’s-level program', Certificate: 'Certificate program' };
export const levelKicker = (p) => LEVEL_KICKER[p.level];

/** Every term with its number, skill badge, lessons ([code, title]) and graded projects ({ title, week }). */
export const termsOf = (p) => p.terms.map((t, i) => ({
  n: i + 1, title: t.title, badge: t.badge, lessons: t.lessons,
  projects: t.projects.map(([title, day]) => ({ title, week: weekOf(day) })),
}));
/** The lesson codes a program teaches, across all its terms. */
export const lessonCodes = (p) => new Set(p.terms.flatMap((t) => t.lessons.map(([code]) => code)));

/** The weeks in which projects fall due (the same in every term today: 3, 7 and 12). */
export function projectWeeks(p) {
  const weeks = new Set(p.terms.flatMap((t) => t.projects.map(([, day]) => weekOf(day))));
  return [...weeks].sort((a, b) => a - b);
}

/** "3, 7 and 12" */
export const listAnd = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** How the terms are laid out, in one sentence. A one-term certificate is one term, not "each term". */
export const pathLede = (p) => (p.termCount === 1
  ? `One 12-week term with ${plural(p.terms[0].lessons.length, 'competency lesson')}, each with PDF notes, and ${plural(p.terms[0].projects.length, 'graded project')}, due in weeks ${listAnd(projectWeeks(p))}.`
  : `${plural(p.termCount, 'term')} of 12 weeks. Each term has ${p.terms[0].lessons.length} competency lessons with PDF notes and ${p.terms[0].projects.length} graded projects, due in weeks ${listAnd(projectWeeks(p))}.`);

/** The 12 weeks of one term: the class and office hours every week, and which project (1-3) is due, if any. */
export function weekStrip(p) {
  const due = projectWeeks(p);
  return Array.from({ length: SCHEDULE.weeks }, (_, i) => {
    const w = i + 1;
    const k = due.indexOf(w);
    return { week: w, project: k >= 0 ? k + 1 : null };
  });
}

export const LIVE = {
  classLine: `${SCHEDULE.classDay} ${SCHEDULE.classTime} ET · ${SCHEDULE.classMinutes} min`,
  officeLine: `${SCHEDULE.officeDay} ${SCHEDULE.officeTime} ET · ${SCHEDULE.officeMinutes} min`,
  sentence: `Live class on ${SCHEDULE.classDay}s and office hours on ${SCHEDULE.officeDay}s, both at ${SCHEDULE.classTime} US Eastern Time (ET), on Jitsi and recorded for the portal.`,
};

// ---------------------------------------------------------------- the learning system (the same three ideas the site states)
export const SYSTEM = [
  { title: 'Learn *smarter*', text: 'Watch lessons when it suits you, inside a learning path that lays out every term, date and project of your program.',
    points: ['A lesson counts as complete when you have watched 90% of it', 'PDF notes and briefs to keep; videos stream in the portal and are never downloadable', 'Every term, date and deadline in one learning path'] },
  { title: 'Prove *mastery*', text: 'Every term has three projects, graded by instructors on a four-level rubric.',
    points: null /* filled per program: the project weeks */ },
  { title: 'Stay *supported*', text: 'Instructors teach live and grade your work, and your instructor sees when you go quiet.',
    points: [`Live class on ${SCHEDULE.classDay}s, office hours on ${SCHEDULE.officeDay}s`, 'Instructors who teach your classes and grade your projects', 'After 14 days without activity, you appear on your instructor’s check-in list'] },
];
export const systemFor = (p) => SYSTEM.map((s) => (s.points ? s : { ...s, points: [
  `Projects due in weeks ${listAnd(projectWeeks(p))}`, 'Written feedback on every submission', 'Proficient or better passes; below that, revise and resubmit',
] }));

/** The rubric with its result: [name, text, 'Pass' | 'Revise and resubmit']. */
export const rubricRows = () => RUBRIC.map(([name, text, kind]) => [name, text, kind === 'pass' ? 'Pass' : 'Revise and resubmit']);
export const RUBRIC_RULE = 'Proficient or better passes. Below that, you get written feedback and resubmit.';

// ---------------------------------------------------------------- careers and certifications
/**
 * The roles a program is designed for. `taught` lists only the role's skills ([skill, code]) whose lesson this program
 * itself teaches: the role's other skills are taught by other programs, and its career page shows them.
 */
export const rolesOf = (p) => {
  const codes = lessonCodes(p);
  return p.roles.map((id) => ({ id, url: `/careers/${id}/`, ...ROLES[id], taught: ROLES[id].skills.filter(([, code]) => codes.has(code)) }));
};
/** The day the certifications were last checked on their official pages, e.g. "3 October 2026". */
export const CHECKED_ON = new Date(`${CHECKED}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const CERTS_INTRO = 'Certifications from technology companies and certification bodies whose official exam topics overlap this program.';
/** Certifications with their status note (an exam being updated, or in beta) when the official page gives one. */
export const certsOf = (p) => certsFor(p.id).map((c) => ({ name: c.name, vendor: c.vendor, exam: c.exam ?? null, url: c.url, status: c.status ?? null }));

// ---------------------------------------------------------------- tuition
const LATER = 'will be published before the first batch';
export const TUITION_NOTE = 'Launch pricing in US dollars. You pay one term at a time, so each payment covers only the term you are starting (plus the one-time application fee).';
export function tuitionOf(p) {
  return {
    perTerm: money(p.tuition.perTerm), total: money(p.tuition.total), fee: money(p.tuition.applicationFee), terms: p.termCount,
    financing: 'Pay per term. Loans, instalments within a term and scholarships are not offered yet.',
    refunds: OWNER.refundPolicy
      ? 'The refund and deferral policy is published, and you see it before you pay.'
      : `The policy ${LATER}, and you will see it before you pay.`,
    note: TUITION_NOTE,
  };
}

// ---------------------------------------------------------------- joining: the same four steps as /admissions/
export const JOIN_STEPS = (p) => [
  { title: 'Find your program', text: `Compare the ${PROGRAMS.length} programs, or answer four questions in Find my program. Check what each one needs and how many hours a week it takes.` },
  { title: 'Request a seat', text: 'Choose a program and a start date, and give your name, email and country. It is not an application and is free to request. The application fee is paid later when enrolment opens.' },
  { title: 'We reply by email', text: 'Nuvora replies by email with next steps for your program and start date. The application, the fee and first-term payment open later.' },
  { title: 'Confirm and pay for your first term', text: `Complete the application, pay the one-time ${money(p.tuition.applicationFee)} application fee and pay for your first term. You pay one term at a time, and you see the refund and deferral policy before you pay.` },
];

// ---------------------------------------------------------------- questions the guide (and the program page) answer
const lowerFirst = (s) => (/^(Python|SQL|[A-Z]{2,})\b/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
const DEGREE = /bachelor’s degree/i;
/**
 * "Do I need to know how to code?", answered from the program's requirements. A requirement written as
 * "No coding experience needed: term 1 teaches Python" or "None: the course starts from the basics" gives the reason;
 * a bachelor's degree is a rule for joining, not a coding skill, so it is named separately.
 */
export function codingAnswer(p) {
  const why = p.required.find((r) => /^(No coding experience needed|None):/.test(r));
  const items = p.required.filter((r) => r !== why && !DEGREE.test(r)).map(lowerFirst);
  // "Python programming, and linear algebra and probability": a serial comma when an item has its own "and".
  const skills = items.length > 1 && items.some((s) => / and /.test(s)) ? `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}` : listAnd(items);
  if (!p.requiresCoding) {
    const reason = why ? upperFirst(why.slice(why.indexOf(':') + 1).trim()) : 'No coding experience is needed';
    return items.length ? `No. ${reason} from the start; you need ${skills}.` : `No. ${reason}.`;
  }
  const degree = p.required.some((r) => DEGREE.test(r)) ? '; joining also needs a bachelor’s degree in any field' : '';
  return `Yes. You need ${skills}${degree}.`;
}

/** The questions on the guide and on the program page. */
export function guideFaq(p) {
  return [
    [`How long does the ${p.name} take?`, p.termCount === 1
      ? 'One 12-week term. It starts on the first Monday of a month.'
      : `${plural(p.termCount, 'term')} of 12 weeks, taken one after another: ${p.duration}. Each term starts on the first Monday of a month.`],
    ['How many hours a week does it take?', `Plan for about ${p.weeklyHours} hours a week: two live Jitsi sessions (${SCHEDULE.classMinutes} and ${SCHEDULE.officeMinutes} minutes) plus lessons and project work in your own time.`],
    ['Do I need to know how to code?', codingAnswer(p)],
    ['What does it cost in total?', p.termCount === 1
      ? `${money(p.tuition.perTerm)} for the term, plus a one-time ${money(p.tuition.applicationFee)} application fee. Prices are launch pricing in US dollars.`
      : `${money(p.tuition.perTerm)} per term for ${plural(p.termCount, 'term')}, ${money(p.tuition.total)} in total, plus a one-time ${money(p.tuition.applicationFee)} application fee. You pay one term at a time. Prices are launch pricing in US dollars.`],
    ['What do I receive when I finish?', `A ${CREDENTIAL.short} for the ${p.name}. ${CREDENTIAL.note}`],
    ['Can I download the lesson videos?', 'No. Lessons and class recordings stream in the student portal only. Lesson notes, exercise sheets and project briefs are PDFs you can download.'],
  ];
}
