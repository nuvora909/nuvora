// Website view of the catalog. Curriculum, terms, schedule and tuition come from scripts/catalog.mjs (the same
// source the database uses); this file adds the decision-making facts a prospective student needs.
// Every statement here must be true today. No outcome numbers, ratings or popularity claims.
import { PROGRAMS as CORE, TERMS, TUITION, LIVE_PATTERN, TIMEZONE } from '../../scripts/catalog.mjs';

export { TUITION, LIVE_PATTERN, TIMEZONE };

// Owner decisions (2026-10-02): flexible + live pace; Nuvora certificate of completion, not an accredited degree.
export const PACE = {
  short: 'Flexible + live',
  long: 'Watch lessons any time, plus two live Zoom sessions a week (recorded)',
};
export const CREDENTIAL = {
  short: 'Nuvora certificate of completion',
  note: 'Not an accredited degree. Credits describe workload and may not transfer to universities.',
};

const LEVEL = {
  Bachelor: { label: 'Bachelor’s-level program', weekly: '8–12', length: '3–4 years part-time' },
  Master: { label: 'Master’s-level program', weekly: '10–14', length: '12–18 months part-time' },
  Certificate: { label: 'Certificate', weekly: '8–10', length: '12 weeks (one term)' },
};

const EXTRA = {
  'bs-ds': {
    slug: 'bs-data-science', topics: ['Data Science'], track: 'data-science',
    tagline: 'Statistics, Python and SQL through to experiment design and production dashboards.',
    audience: ['Career changers moving into data', 'Analysts who want a complete data science foundation', 'Learners who want structured, project-based study without leaving work'],
    required: ['High-school mathematics', 'No coding experience needed: term 1 teaches Python'],
    helpful: ['Spreadsheets', 'Curiosity about numbers and decisions'],
    roles: ['data-analyst', 'senior-data-analyst', 'data-scientist'],
    tools: ['Python', 'pandas', 'SQL', 'scikit-learn', 'Tableau', 'dbt', 'Git'],
    capstone: 'Take a public dataset from question to a live dashboard, and write a decision memo for a stakeholder.',
  },
  'bs-aiml': {
    slug: 'bs-ai-machine-learning', topics: ['Machine Learning', 'Generative AI'], track: 'data-to-ai',
    tagline: 'From Python and the maths of ML to deep learning, LLM systems and MLOps, with evaluation built in from the start.',
    audience: ['Learners who want to build AI and machine learning systems', 'Developers moving into machine learning', 'Analysts aiming for ML engineering'],
    required: ['High-school mathematics including algebra', 'No coding experience needed: term 1 teaches Python'],
    helpful: ['Some programming', 'Comfort with mathematics'],
    roles: ['ml-ai-specialist', 'ml-engineer', 'ai-engineer'],
    tools: ['Python', 'NumPy', 'PyTorch', 'scikit-learn', 'Hugging Face', 'Docker', 'MLflow'],
    capstone: 'Build and ship an ML system with an evaluation plan, a model card and a monitoring dashboard.',
  },
  'ms-aml': {
    slug: 'ms-applied-machine-learning', topics: ['Machine Learning', 'MLOps'], track: 'engineering-to-ai',
    tagline: 'Production machine learning, deep learning architectures and responsible deployment, for working engineers.',
    audience: ['Software engineers and analysts who already use Python', 'ML practitioners moving into production ML'],
    required: ['A bachelor’s degree in any field', 'Python programming', 'Linear algebra and probability'],
    helpful: ['Experience training a machine learning model'],
    roles: ['ml-engineer', 'ai-engineer', 'ai-product-lead'],
    tools: ['PyTorch', 'Ray', 'Kubernetes', 'MLflow', 'Spark'],
    capstone: 'An industry-scale project on public or permitted data, presented and defended to instructors.',
  },
  'ms-ds': {
    slug: 'ms-data-science-analytics', topics: ['Data Science'], track: 'data-science',
    tagline: 'Advanced statistics, experimentation and data strategy for people who lead analytics work.',
    audience: ['Analysts and data scientists stepping into senior or lead roles', 'Managers who make decisions with data'],
    required: ['A bachelor’s degree in any field', 'SQL and Python or R', 'Introductory statistics'],
    helpful: ['Experience running analyses for stakeholders'],
    roles: ['data-scientist', 'analytics-manager', 'ai-product-lead'],
    tools: ['Python', 'R', 'SQL', 'Spark', 'Stan', 'Looker'],
    capstone: 'Design and analyse an experiment or forecasting system, then present it as an executive decision brief.',
  },
  'c-py': {
    slug: 'certificate-python-data-analysis', topics: ['Data Science'], track: 'data-science',
    tagline: 'A focused 12-week start in Python, SQL and data analysis.',
    audience: ['Beginners starting a data career', 'Professionals who work in spreadsheets'],
    required: ['None: the course starts from the basics'],
    helpful: ['Spreadsheets'],
    roles: ['data-analyst'],
    tools: ['Python', 'pandas', 'SQL', 'Jupyter'],
    capstone: 'Publish a cleaned, analysed dataset notebook to your public portfolio.',
  },
  'c-genai': {
    slug: 'certificate-generative-ai-llm-apps', topics: ['Generative AI'], track: 'engineering-to-ai',
    tagline: 'Prompting, retrieval, agents and evaluation for developers building with large language models.',
    audience: ['Developers building features with LLMs', 'Product engineers exploring AI'],
    required: ['Python programming', 'Using web APIs'],
    helpful: ['Some experience shipping software'],
    roles: ['ai-engineer'],
    tools: ['Python', 'LLM APIs', 'Vector databases', 'Evaluation tools'],
    capstone: 'Ship a working LLM application with an automated evaluation suite.',
  },
  'c-mlops': {
    slug: 'certificate-mlops-data-engineering', topics: ['MLOps'], track: 'engineering-to-ai', weekly: '10–12',
    tagline: 'Pipelines, orchestration, model serving and monitoring: the skills that get models into production.',
    audience: ['Data engineers and backend developers', 'Data scientists who deploy their own models'],
    required: ['Python', 'The command line and Git', 'Basic cloud concepts'],
    helpful: ['Docker'],
    roles: ['mlops-engineer', 'ml-engineer'],
    tools: ['Airflow', 'dbt', 'Docker', 'Kubernetes', 'MLflow', 'Terraform'],
    capstone: 'Deploy a monitored, retrainable model pipeline in the cloud.',
  },
};

export const PROGRAMS = CORE.map((p) => {
  const x = EXTRA[p.id];
  const terms = TERMS[p.id];
  const perTerm = TUITION.perTerm[p.level];
  const lvl = LEVEL[p.level];
  return {
    id: p.id, name: p.name, level: p.level, credits: p.credits,
    levelLabel: lvl.label,
    slug: x.slug, url: `/programs/${x.slug}/`, topics: x.topics, track: x.track,
    tagline: x.tagline, audience: x.audience, required: x.required, helpful: x.helpful,
    roles: x.roles, tools: x.tools, capstone: x.capstone,
    weeklyHours: x.weekly ?? lvl.weekly,
    duration: lvl.length,
    terms,
    termCount: terms.length,
    creditsPerTerm: Math.round(p.credits / terms.length),
    projects: terms.reduce((n, t) => n + t.projects.length, 0),
    lessons: terms.reduce((n, t) => n + t.lessons.length, 0),
    tuition: { perTerm, total: perTerm * terms.length, applicationFee: TUITION.applicationFee, currency: TUITION.currency },
    needsBachelor: p.level === 'Master',
  };
});

export const P = (id) => PROGRAMS.find((p) => p.id === id);
export const TOPICS = ['Data Science', 'Machine Learning', 'Generative AI', 'MLOps'];

export const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

// Start dates: the first Monday of each month; applications close 7 days before (inclusive, matching the
// database function next_start_date). Dates are calendar dates in the batch time zone (Asia/Kolkata).
export function firstMonday(year, month) {
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
export function nextStarts(count, today = todayInKolkata()) {
  const out = [];
  let y = today.getUTCFullYear(), m = today.getUTCMonth();
  while (out.length < count) {
    const start = firstMonday(y, m);
    const applyBy = new Date(start.getTime() - 7 * 86400000);
    if (applyBy >= today) out.push({ start, applyBy });
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return out;
}
export function todayInKolkata(now = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${s}T00:00:00Z`);
}
export const fmtDay = (d) => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
export const isoDay = (d) => d.toISOString().slice(0, 10);
