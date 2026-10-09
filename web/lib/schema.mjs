// JSON-LD structured data. Only facts that are true today: no reviews, ratings, events, people, videos or
// credential markup (the credential wording needs legal sign-off first).
import { SITE, SCHEDULE, FAQ } from '../data/site.mjs';
import { nextStarts, isoDay, TIMEZONE } from '../data/programs.mjs';

const ORG_ID = () => `${SITE.origin}/#organization`;

export const organization = () => ({
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  '@id': ORG_ID(),
  name: SITE.name,
  url: `${SITE.origin}/`,
  logo: `${SITE.origin}/favicon.svg`,
  description: SITE.description,
});

export const website = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: `${SITE.origin}/`,
  publisher: { '@id': ORG_ID() },
});

export const breadcrumbList = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE.origin + href })),
});

export const faqPage = (items = FAQ) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

// One weekly Schedule per live session: the class and the office hours have their own day, time and length.
// No timeRequired, courseWorkload or numberOfCredits: weekly hours are a range, not a total, and Nuvora credits
// describe workload only and may not transfer, so none of them can be stated as a single true value.
const weekly = ({ day, time, minutes }, start, end) => ({
  '@type': 'Schedule',
  repeatFrequency: 'P1W',
  byDay: `https://schema.org/${day}`,
  startTime: time,
  duration: `PT${minutes}M`,
  scheduleTimezone: TIMEZONE,
  startDate: isoDay(start),
  endDate: isoDay(end),
});

// A program as a Course with its next batch (term 1) as the CourseInstance.
export function course(p, today) {
  const { start } = nextStarts(1, today)[0];
  const end = new Date(start.getTime() + (SCHEDULE.weeks * 7 - 1) * 86400000);
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    '@id': `${SITE.origin}${p.url}#course`,
    name: p.name,
    description: p.tagline,
    url: SITE.origin + p.url,
    provider: { '@id': ORG_ID() },
    educationalLevel: p.levelLabel,
    inLanguage: 'en',
    teaches: p.terms.flatMap((t) => t.lessons.map(([, title]) => title)).slice(0, 12),
    coursePrerequisites: p.required,
    offers: {
      '@type': 'Offer',
      category: 'Paid',
      price: p.tuition.perTerm,
      priceCurrency: p.tuition.currency,
      description: `Per 12-week term (${p.termCount} ${p.termCount === 1 ? 'term' : 'terms'}), plus a one-time application fee`,
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'Online',
      startDate: isoDay(start),
      endDate: isoDay(end),
      courseSchedule: [
        weekly({ day: SCHEDULE.classDay, time: SCHEDULE.classTime, minutes: SCHEDULE.classMinutes }, start, end),
        weekly({ day: SCHEDULE.officeDay, time: SCHEDULE.officeTime, minutes: SCHEDULE.officeMinutes }, start, end),
      ],
    },
  };
}

export const itemList = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: items.map(([url, name], i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.origin + url, name })),
});
