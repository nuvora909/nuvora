// Site-wide facts and settings. Everything here must be true today; owner-supplied facts that are not decided
// yet stay null and the pages say so plainly instead of inventing them.
import { LIVE_PATTERN, TUITION, money } from './programs.mjs';

export const SITE = {
  name: 'Nuvora',
  // Absolute origin for canonical links and the sitemap. Set NUVORA_SITE_ORIGIN when building for the real domain.
  origin: (process.env.NUVORA_SITE_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, ''),
  // Pre-launch gate: every page carries noindex until the owner switches this off at launch.
  indexable: process.env.NUVORA_INDEXABLE === '1',
  description: 'Online data science and AI programs taught in 12-week terms: lessons you watch any time, two live Zoom sessions a week and projects graded by instructors.',
  status: 'Pre-launch',
  consentVersion: '2026-10-02',
};

// Owner facts that are not published yet. Pages render "to be published before the first batch" for null values.
export const OWNER = {
  legalEntity: null,
  address: null,
  supportEmail: null,
  phone: null,
  supportHours: null,
  grievanceOfficer: null,
  refundPolicy: null,
  instructors: [],
  // Official social accounts, as full https:// profile URLs. The footer shows a round icon only for accounts set
  // here; none exist yet, so none are shown.
  social: { linkedin: null, youtube: null, instagram: null, x: null, facebook: null },
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SCHEDULE = {
  weeks: LIVE_PATTERN.weeks,
  classDay: DAYS[LIVE_PATTERN.classDay], classDayNo: LIVE_PATTERN.classDay, classTime: LIVE_PATTERN.classTime, classMinutes: LIVE_PATTERN.classMinutes,
  officeDay: DAYS[LIVE_PATTERN.officeDay], officeDayNo: LIVE_PATTERN.officeDay, officeTime: LIVE_PATTERN.officeTime, officeMinutes: LIVE_PATTERN.officeMinutes,
};

export const RUBRIC = [
  ['Distinguished', 'Exceeds the brief: thorough, well reasoned and clearly explained.', 'pass'],
  ['Proficient', 'Meets every requirement of the brief. This is the passing standard.', 'pass'],
  ['Basic', 'Partly there. You get written feedback and revise and resubmit.', 'revise'],
  ['Not yet', 'Key requirements are missing. You get written feedback and resubmit.', 'revise'],
];

export const FACTS = [
  ['12-week terms', 'Every term is one batch that starts on the first Monday of a month.'],
  ['2 live sessions a week', `${SCHEDULE.classDay} class and ${SCHEDULE.officeDay} office hours on Zoom, recorded for the portal.`],
  ['Lessons on demand', 'Watch any time in the portal. Lesson notes and project briefs download as PDFs.'],
  ['Graded by instructors', 'Three projects a term on a four-level mastery rubric, with resubmission.'],
];

export const FAQ = [
  ['Is Nuvora an accredited university?',
    'No. Nuvora awards a Nuvora certificate of completion, not an accredited degree. Program names such as B.S. and M.S. describe the level and scope of study. Nuvora credits measure workload and may not transfer to universities.'],
  ['How do classes work?',
    `Each term is a 12-week batch. You watch lessons in the portal whenever it suits you, and join two live Zoom sessions a week: a ${SCHEDULE.classMinutes}-minute class on ${SCHEDULE.classDay}s and ${SCHEDULE.officeMinutes}-minute office hours on ${SCHEDULE.officeDay}s, both at ${SCHEDULE.classTime} India time. Sessions are recorded so you can catch up.`],
  ['Can I download the lesson videos?',
    'No. Lessons and class recordings stream in the student portal only. Lesson notes, exercise sheets and project briefs are PDFs you can download.'],
  ['When can I start?',
    'Batches start on the first Monday of every month. Seat requests for a start close 7 days before it.'],
  ['How much does it cost?',
    `${money(TUITION.perTerm.Certificate)} per 12-week term for certificates and bachelor’s-level programs, ${money(TUITION.perTerm.Master)} per term for master’s-level programs, plus a one-time ${money(TUITION.applicationFee)} application fee. Prices are launch pricing in US dollars, and you pay one term at a time.`],
  ['How am I assessed?',
    'Each term has three projects graded by instructors on a four-level rubric: Distinguished, Proficient, Basic and Not yet. Proficient or better passes. Below that, you get written feedback and resubmit.'],
  ['Do I need a degree to join?',
    'Only for the master’s-level programs, which need a bachelor’s degree in any field. Certificates and bachelor’s-level programs need no degree, and the beginner programs teach Python from the start.'],
  ['Will this get me a job?',
    'Nuvora teaches the skills used in data and AI roles, but it does not guarantee jobs, promotions or salaries. We are pre-launch, so there are no graduates or job outcomes yet. We will publish real results, with how they were measured, after our first batches finish.'],
];

// Photos and video clips are stock media used under their licences. People shown are not Nuvora students.
export const PHOTOS = {
  group: { src: '/img/hero-group.jpg', alt: 'Three friends laughing together while working on laptops at a café table', pos: '50% 40%', by: 'Brooke Cagle', id: 'g1Kr4Ozfoac' },
  laptop: { src: '/img/hero-laptop.jpg', alt: 'Two young women smiling at a laptop, one pointing at the screen', pos: '50% 35%', by: 'Van Tay Media', id: 'pc_HmXZ0e_w' },
  home: { src: '/img/learner-home.jpg', alt: 'A young man concentrating on his laptop', pos: '50% 25%', by: 'Kojo Kwarteng', id: 'KUzlAah2dog' },
  cohort: { src: '/img/study-group.jpg', alt: 'A group of students gathered around a laptop in a lecture hall', pos: '50% 40%', by: 'Vitaly Gariev', id: 'kp7qkHTgSKc' },
  career: { src: '/img/career-present.jpg', alt: 'A woman presenting charts on a large screen to colleagues', pos: '62% 40%', by: 'Vitaly Gariev', id: 'SSEuzLIIYAc' },
  mentor: { src: '/img/mentor.jpg', alt: 'A smiling teacher taking notes at a desk in front of a chalkboard', pos: '55% 30%', by: 'Vitaly Gariev', id: 'TOuMSV0Nqjk' },
  duo: { src: '/img/data-duo.jpg', alt: 'Two colleagues reviewing a data dashboard on a laptop', pos: '55% 50%', by: 'Vitaly Gariev', id: 't3RACFVYRlk' },
  login: { src: '/img/login-pro.jpg', alt: 'A woman in a blazer and glasses working on a laptop', pos: '50% 30%', by: 'Andrei koscina', id: '6ApefjGvASw' },
};

export const CLIPS = [
  { src: '/video/curly-smile.mp4', title: 'Woman with curly hair smiling at her laptop', by: 'SHVETS production', url: 'https://www.pexels.com/video/woman-with-curly-hair-using-a-laptop-7196107/', from: 0.4, dur: 5.6 },
  { src: '/video/library-man.mp4', title: 'Man working at his laptop in a library', by: 'Ron Lach', url: 'https://www.pexels.com/video/a-man-working-inside-the-library-8036713/', from: 8, dur: 6.2 },
  { src: '/video/pro-woman.mp4', title: 'Woman sitting at a table with her laptop', by: 'Josh Tavernier', url: 'https://www.pexels.com/video/a-woman-sitting-at-a-table-with-her-laptop-18019218/', from: 0, dur: 3.6 },
  { src: '/video/heart-laptop.mp4', title: 'Woman making a hand heart at her laptop', by: 'Artem Podrez', url: 'https://www.pexels.com/video/a-woman-making-a-hand-heart-while-looking-at-a-laptop-4492648/', from: 1.2, dur: 6 },
];

export const NAV = [
  ['/programs/', 'Programs'],
  ['/careers/', 'Careers'],
  ['/how-it-works/', 'How it works'],
  ['/tuition/', 'Tuition'],
  ['/admissions/', 'Admissions'],
];
