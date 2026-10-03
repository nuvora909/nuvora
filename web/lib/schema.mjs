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

const DAY = { Tuesday: 'https://schema.org/Tuesday', Thursday: 'https://schema.org/Thursday' };

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
    timeRequired: `PT${p.weeklyMin}H`,
    numberOfCredits: p.credits,
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
      courseWorkload: `PT${p.weeklyMin}H`,
      courseSchedule: {
        '@type': 'Schedule',
        repeatFrequency: 'P1W',
        byDay: [DAY[SCHEDULE.classDay], DAY[SCHEDULE.officeDay]],
        startTime: SCHEDULE.classTime,
        duration: `PT${SCHEDULE.classMinutes}M`,
        scheduleTimezone: TIMEZONE,
        startDate: isoDay(start),
        endDate: isoDay(end),
      },
    },
  };
}

export const itemList = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: items.map(([url, name], i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.origin + url, name })),
});
