// Topic guides and the free sample lesson.
//   /learn/                 the four topics, how they fit together, the sample lesson, and where to go next
//   /learn/<topic-slug>/    one guide per topic in TOPICS: what it is, key concepts (with the Nuvora program and
//                           term that teaches each), roles, programs, related topics and a FAQ
//   /learn/sample-lesson/   gradient descent: explanation, interactive chart and a practice check (not graded)
// Lesson codes, terms, programs and roles all come from the catalog and data modules, so the pages stay in step
// with the curriculum. The concept definitions explain the idea in general; they are not a syllabus.
import { html, raw, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { programCard, faqList, ctaBand } from '../lib/components.mjs';
import { breadcrumbList, faqPage, itemList } from '../lib/schema.mjs';
import { PROGRAMS, TOPICS, P } from '../data/programs.mjs';
import { ROLES, CAREER_NOTE } from '../data/careers.mjs';
import { SITE, SCHEDULE } from '../data/site.mjs';
import { TERMS } from '../../scripts/catalog.mjs';
import {
  START, LR, PRESETS, QUESTIONS, descend, readout, stepRows, svgMarkup, num,
} from '../assets/js/sample-lesson.js';

const STYLES = ['/css/learn.css'];
const slugTopic = (t) => t.toLowerCase().replace(/\s+/g, '-');
const topicUrl = (t) => `/learn/${slugTopic(t)}/`;
const SAMPLE = '/learn/sample-lesson/';
const VIEWBOX = '0 0 440 276';
const week = (day) => Math.ceil(day / 7);
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// ---------- catalog lookups ----------

// Every place a lesson code is taught: code -> [{ p, n, term }] in catalog order.
const TAUGHT = new Map();
for (const [pid, terms] of Object.entries(TERMS)) {
  const p = P(pid);
  if (!p) continue;
  terms.forEach((term, i) => term.lessons.forEach(([code, title]) => {
    if (!TAUGHT.has(code)) TAUGHT.set(code, { title, where: [] });
    TAUGHT.get(code).where.push({ p, n: i + 1, term });
  }));
}
// The term number of the first term in a program whose title matches.
const termNo = (pid, re) => TERMS[pid].findIndex((t) => re.test(t.title)) + 1;
const whereLabel = ({ p, n, term }) => (p.termCount === 1
  ? `${p.short} (one-term certificate)`
  : `${p.short}, term ${n}: ${term.title}`);

const programsFor = (topic) => {
  const list = PROGRAMS.filter((p) => p.topics.includes(topic));
  // Programs that focus on this topic alone come first.
  return [...list.filter((p) => p.topics.length === 1), ...list.filter((p) => p.topics.length > 1)];
};
const toolsFor = (topic) => [...new Set(programsFor(topic).flatMap((p) => p.tools))].slice(0, 10);

// ---------- topic content ----------
// Plain-English explanations written for this site. FAQ answers are standalone (for voice and AI search) and use
// catalog facts for anything about Nuvora.
const TOPIC_INFO = {
  'Data Science': {
    icon: 'chart', colors: ['#0064E0', '#0082FB'], lower: 'data science',
    title: 'What is data science? Concepts, roles, programs',
    description: 'What data science is, in plain English: key concepts from statistics to A/B tests, the roles that use them, and the Nuvora programs that teach each one.',
    h1: 'What is *data science*?',
    lede: 'Data science turns questions into evidence. Here is what the field involves, the ideas at its core, the roles that use them and where Nuvora teaches each one.',
    summary: 'Answer questions with data: statistics, Python and SQL, experiments and clear communication.',
    chain: 'Asks questions of data and answers them with evidence.',
    what: [
      'Data science is the work of answering questions with data. A data scientist takes a real-world question (which customers are likely to leave, whether a new checkout page sells more, how many orders to expect next month), finds and cleans the data that bears on it, analyses it, and explains what the evidence does and does not support.',
      'It sits where statistics, programming and knowledge of a field meet. Statistics tells you how far to trust a pattern. Programming, usually Python and SQL, lets you work with data far too big for a spreadsheet. Knowing the business or field tells you which questions matter and which answers make sense.',
      'Much of the day-to-day work is less glamorous than modelling: getting data out of databases, checking it for errors and gaps, and turning results into charts, dashboards and short written recommendations. Machine learning is one tool in the kit, used when prediction is the goal.',
      'The field overlaps with data analysis, which focuses more on describing what happened, and with machine learning, which focuses on models that predict. It is common to start as an analyst and grow into data science as your statistics and programming deepen.',
    ],
    concepts: [
      ['STA-140', 'Drawing conclusions about a whole population from a sample: confidence intervals, hypothesis tests, and what a p-value does and does not tell you.'],
      ['DBS-130', 'Querying relational databases with SQL (filtering, joining and aggregating tables) and designing tables so the data stays consistent.'],
      ['DAT-210', 'Getting to know a new dataset before modelling it: distributions, missing values, outliers and the first questions worth asking.'],
      ['VIS-220', 'Choosing the chart that fits the question, and making it honest and easy to read.'],
      ['DAT-230', 'Modelling how an outcome changes with its inputs: linear regression, and generalized linear models such as logistic regression for yes-or-no outcomes.'],
      ['DAT-250', 'Running controlled experiments: random assignment, choosing a sample size, and reading the result without fooling yourself.'],
      ['STA-620', 'Predicting values that change over time, such as weekly sales, while accounting for trend and seasonality, and measuring forecast error honestly.'],
      ['STA-630', 'Estimating cause and effect when a randomized experiment is not possible, and being clear about the assumptions that requires.'],
    ],
    roles: ['data-analyst', 'senior-data-analyst', 'data-scientist', 'analytics-manager'],
    related: ['Machine Learning', 'MLOps'],
    faq: () => {
      const [py, bs, ms] = [P('c-py'), P('bs-ds'), P('ms-ds')];
      const maths = termNo('bs-ds', /^Mathematics/);
      const stats = termNo('bs-ds', /^Probability/);
      return [
        ['What is data science?', 'Data science is the practice of answering questions with data. It combines statistics, programming (usually Python and SQL) and knowledge of a field to collect and clean data, analyse it, build models where prediction helps, and explain the results so that people can make better decisions.'],
        ['What is the difference between a data analyst and a data scientist?', 'A data analyst mostly describes what happened: querying databases, building reports and dashboards, and answering business questions. A data scientist does more statistical modelling and prediction, such as forecasting demand or designing experiments. The roles overlap a lot, and it is common to start as an analyst and move into data science.'],
        ['Do I need to know how to code to learn data science?', `Not to start. The ${py.name} and the ${bs.name} both begin with Python fundamentals, so no coding experience is needed. The ${ms.name} is different: it expects SQL and Python or R, introductory statistics and a bachelor’s degree in any field before you join.`],
        ['How much maths do I need for data science?', `Comfortable high-school mathematics is enough to begin. The statistics you need, such as probability, distributions, confidence intervals and hypothesis tests, can be learned along the way. In Nuvora’s ${bs.name}, term ${maths} covers linear algebra and calculus, and term ${stats} covers probability and statistics, before the modelling terms.`],
      ];
    },
  },
  'Machine Learning': {
    icon: 'pulse', colors: ['#0A1A3F', '#0866FF'], lower: 'machine learning',
    title: 'What is machine learning? Concepts, roles, programs',
    description: 'Machine learning explained in plain English: models, loss and gradient descent, evaluation, the roles that use it and the Nuvora programs that teach it.',
    h1: 'What is *machine learning*?',
    lede: 'Machine learning builds software that learns from examples. Here is how it works, the concepts you would learn, the roles that use them and where Nuvora teaches each one.',
    summary: 'Teach software to learn from examples: models, loss functions, optimization and honest evaluation.',
    chain: 'Learns patterns from examples to make predictions.',
    what: [
      'Machine learning is a way of building software that learns patterns from examples instead of following rules a programmer wrote by hand. Show a model many past loan applications together with how each one turned out, and it learns to estimate the outcome of a new application.',
      raw(`Most machine learning comes down to three parts: a model with adjustable numbers called parameters, a loss function that measures how wrong its predictions are, and an optimizer that adjusts the parameters to make the loss smaller. Gradient descent, which you can try in our <a href="${SAMPLE}">free sample lesson</a>, is the idea behind the optimizers used to train most modern models.`),
      'The main families are supervised learning (learning from labelled examples to predict a label or a number), unsupervised learning (finding structure, such as groups, in data without labels) and reinforcement learning (learning by trial and reward). Deep learning uses neural networks with many layers and powers image recognition, speech and language models.',
      'The hard part is rarely training a model. It is framing the problem well, preparing good data and evaluating honestly: a model that scores well on the data it was trained on can still fail on new data. Careful validation is what separates a demo from a model people can rely on.',
    ],
    concepts: [
      ['MTH-160', raw(`How models learn: minimizing a loss function with gradient descent and its variants. <a href="${SAMPLE}">Try it in the sample lesson</a>.`)],
      ['ML-210', 'Learning to predict a label or a number from labelled examples, with models such as linear and logistic regression and decision trees.'],
      ['ML-220', 'Finding structure in data without labels: clustering similar items and reducing many features to a few that capture most of the variation.'],
      ['ML-230', 'Splitting data into training, validation and test sets, cross-validation, and choosing a metric so a model’s score means something.'],
      ['ML-240', 'Turning raw data into inputs a model can use, such as encoding categories and scaling numbers, without leaking information from the answer.'],
      ['ML-250', 'Combining many models, as random forests and gradient boosting do, to get more accurate and more stable predictions.'],
      ['DL-310', 'Neurons, layers, activation functions and backpropagation, built step by step before relying on a framework.'],
      ['DL-620', 'How the main deep learning architectures differ, such as convolutional networks and transformers, and which problems each suits.'],
    ],
    roles: ['ml-ai-specialist', 'data-scientist', 'ml-engineer'],
    related: ['Data Science', 'Generative AI', 'MLOps'],
    faq: () => {
      const [bs, ms] = [P('bs-aiml'), P('ms-aml')];
      const maths = termNo('bs-aiml', /^Mathematics/);
      const opt = termNo('bs-aiml', /optimization/i);
      return [
        ['What is machine learning?', 'Machine learning is a way of building software that learns patterns from examples instead of following hand-written rules. A model is shown data, a loss function measures how wrong its predictions are, and an optimizer such as gradient descent adjusts the model to reduce that error, so it can make predictions on new data.'],
        ['Do I need maths for machine learning?', `Yes, but it can be learned along the way. The core is linear algebra, calculus for optimization, and probability. Nuvora’s ${bs.name} needs only high-school algebra to join, then teaches this mathematics in terms ${maths} and ${opt}, before the core machine learning terms begin.`],
        ['What is the difference between machine learning and deep learning?', 'Deep learning is a branch of machine learning that uses neural networks with many layers. Classic methods such as linear models and decision trees work well on tables of data. Deep learning does best on images, audio and text, where it learns useful features itself, but it usually needs more data and computing power.'],
        ['How long does it take to learn machine learning?', `It depends on where you start. At Nuvora, the ${bs.name} starts from Python and takes ${bs.termCount} terms of 12 weeks (${bs.duration}) at ${bs.weeklyHours} hours a week. The ${ms.name} is for people who already program and know the maths: ${ms.termCount} terms (${ms.duration}).`],
      ];
    },
  },
  'Generative AI': {
    icon: 'spark', colors: ['#0047B3', '#6D5DF6'], lower: 'generative AI',
    title: 'What is generative AI? Concepts, roles, programs',
    description: 'Generative AI explained in plain English: LLMs, retrieval-augmented generation, tool use and evaluation, related roles and the Nuvora programs that teach it.',
    h1: 'What is *generative AI*?',
    lede: 'Generative AI creates text, images and code. Here is how it works, the concepts behind building with it, the roles that use them and where Nuvora teaches each one.',
    summary: 'Build with large language models: prompting, retrieval, tool use, agents and evaluation.',
    chain: 'Uses large models to create text, images and code.',
    what: [
      'Generative AI refers to models that create new content (text, images, audio or code) rather than only classifying or predicting. Large language models (LLMs) are the best-known example. Trained on very large amounts of text to predict the next piece of text, they can draft, summarize, translate, answer questions and write code.',
      'Most generative AI work today is not training these models from scratch, which takes enormous amounts of data and computing power. It is building applications on top of existing models: writing clear instructions, giving the model the right context, connecting it to tools and data, and checking what it produces.',
      'Two techniques come up constantly. Retrieval-augmented generation (RAG) looks up relevant documents and passes them to the model, so answers are grounded in your own sources. Tool use lets a model call functions such as a search, a database query or a calculator, and agents chain several of these steps together to complete a task.',
      'Because LLMs can produce fluent answers that are wrong, evaluation is a core skill rather than an afterthought. Teams build test sets, automated checks and red-teaming exercises to measure accuracy, catch failures and keep systems safe, both before launch and after.',
    ],
    concepts: [
      ['DL-330', 'How models process sequences such as text, and the attention mechanism at the heart of the transformer architecture behind today’s LLMs.'],
      ['DL-340', 'Adapting a model that was trained on broad data to a narrower task, using a smaller set of your own examples.'],
      ['DL-345', 'Models that produce new data, such as text or images, rather than labels, and how they are trained.'],
      ['AIS-410', 'Building features on large language models: instructions and prompts, structured outputs, and handling cost, speed and failure.'],
      ['AIS-420', 'Finding the passages relevant to a question and giving them to the model, so its answers are grounded in your sources and can cite them.'],
      ['AIS-425', 'Letting a model call functions and APIs, and keeping multi-step agents reliable, bounded and observable.'],
      ['AIS-430', 'Measuring whether an LLM system works, with test sets and automated checks, and deliberately probing it for wrong or harmful behaviour.'],
      ['AIS-660', 'Designing and running LLM-based systems as dependable software, with evaluations in the loop.'],
    ],
    roles: ['ai-engineer', 'ml-ai-specialist', 'ai-product-lead'],
    related: ['Machine Learning', 'MLOps'],
    faq: () => {
      const genai = P('c-genai');
      return [
        ['What is generative AI?', 'Generative AI is a type of artificial intelligence that creates new content, such as text, images, audio or code, instead of only classifying or predicting. Large language models like the ones behind chat assistants are the best-known example: trained on huge amounts of text, they generate a response one small piece at a time.'],
        ['What is retrieval-augmented generation (RAG)?', 'Retrieval-augmented generation, or RAG, is a technique where an application first searches a collection of documents for passages relevant to a question, then gives those passages to a language model along with the question. The model answers from that material, which keeps answers grounded in your sources and lets them include citations.'],
        ['Do I need to know machine learning to build with large language models?', `Not deeply. Building LLM applications relies mostly on software skills: Python, calling web APIs, handling data and testing. Nuvora’s ${genai.name} expects Python and experience with web APIs, not a machine learning background. Understanding how models are trained and evaluated helps as your systems grow.`],
        ['What does an AI engineer do?', 'An AI engineer builds products on top of large language models and other AI models. Typical work includes designing prompts and application logic, connecting models to company data with retrieval, giving them tools, and building evaluations that catch wrong or unsafe answers before users see them. The role sits between software engineering and machine learning.'],
      ];
    },
  },
  MLOps: {
    icon: 'layers', colors: ['#0A1A3F', '#22D3EE'], lower: 'MLOps',
    title: 'What is MLOps? Concepts, roles and programs',
    description: 'MLOps explained in plain English: pipelines, serving, monitoring and continuous training, the roles that do this work and the Nuvora programs that teach it.',
    h1: 'What is *MLOps*?',
    lede: 'MLOps gets machine learning models into production and keeps them working. Here is what that involves, the concepts behind it, the roles that do it and where Nuvora teaches each one.',
    summary: 'Get models into production and keep them working: pipelines, serving, monitoring and retraining.',
    chain: 'Keeps models running reliably in production.',
    what: [
      'MLOps, short for machine learning operations, is the practice of getting machine learning models into production and keeping them working there. It borrows ideas from DevOps, such as automation, version control, testing and monitoring, and adapts them to systems whose behaviour depends on data as well as code.',
      'A model in a notebook is only the start. In production it needs a reliable supply of fresh data, a repeatable way to train and evaluate it, a way to serve predictions to an app or a batch job, and monitoring that notices when quality slips.',
      'Models can get worse without any error message. Customer behaviour changes, input data drifts, or an upstream pipeline breaks. MLOps covers detecting these problems, retraining and redeploying safely, and being able to say exactly which data and code produced the model that is running.',
      'The work overlaps with data engineering, which builds the pipelines that move and transform data, and with platform engineering. Common tools include workflow orchestrators such as Airflow, containers with Docker and Kubernetes, experiment tracking with MLflow, and infrastructure as code with Terraform.',
    ],
    concepts: [
      ['DEN-640', 'Moving and transforming data reliably from source systems to the places where analysts and models use it.'],
      ['DEN-645', 'Scheduling pipeline steps, managing the dependencies between them, and retrying or alerting when something fails.'],
      ['OPS-445', 'Turning model training into repeatable, automated steps: preparing data, training, evaluating and registering a model.'],
      ['OPS-450', 'Recording the code, data, settings and results of every training run, so results can be compared and reproduced.'],
      ['OPS-440', 'Putting a model behind an API or a batch job, then watching its inputs, outputs and quality once it is live.'],
      ['OPS-650', 'Retraining and redeploying models automatically when data changes, with checks before a new model replaces the old one.'],
      ['OPS-455', 'Defining servers, storage and permissions in version-controlled files instead of setting them up by hand.'],
      ['OPS-665', 'Keeping the features used in training and in production consistent, and agreeing on the shape of data passed between teams.'],
    ],
    roles: ['mlops-engineer', 'ml-engineer'],
    related: ['Machine Learning', 'Data Science'],
    faq: () => {
      const mlops = P('c-mlops');
      const lessons = mlops.terms[0].lessons.map(([, t]) => t);
      return [
        ['What is MLOps?', 'MLOps, short for machine learning operations, is the practice of deploying machine learning models and keeping them reliable in production. It applies DevOps ideas such as automation, version control, testing and monitoring to models, and adds what is special about machine learning: tracking data and experiments, detecting drift, and retraining models safely.'],
        ['What is the difference between MLOps and DevOps?', 'DevOps automates how software is built, tested and released. MLOps does the same for machine learning, where behaviour depends on data as well as code. That adds work DevOps rarely needs: versioning datasets, tracking training runs, validating model quality before release, and watching for data drift that quietly makes a deployed model worse.'],
        ['What skills do I need to start in MLOps?', `Solid Python, comfort with the command line and Git, and basic cloud concepts are the usual starting point, and Docker helps. Nuvora’s ${mlops.name} expects those starting skills. Its single 12-week term has ${lessons.length} lessons (${lessons.join('; ')}) and three graded projects.`],
        ['Is MLOps the same as data engineering?', 'No, but they overlap. Data engineering builds the pipelines that collect, clean and move data for analysts and applications. MLOps focuses on the machine learning lifecycle: training, deploying, monitoring and retraining models. MLOps depends on good data pipelines, which is why many teams, and Nuvora’s MLOps certificate, treat the two together.'],
      ];
    },
  },
};

const TOPIC_LIST = TOPICS.filter((t) => TOPIC_INFO[t]).map((name) => {
  const info = TOPIC_INFO[name];
  const concepts = info.concepts.filter(([code]) => TAUGHT.has(code)).map(([code, def]) => ({ code, def, ...TAUGHT.get(code) }));
  return { ...info, name, slug: slugTopic(name), url: topicUrl(name), concepts, programs: programsFor(name), roles: info.roles.filter((r) => ROLES[r]) };
});
const T = (name) => TOPIC_LIST.find((t) => t.name === name);

// ---------- shared pieces ----------

const head = ({ id, eyebrow, title, lede, action = '', center = false }) => html`
<div class="shead${center ? ' center' : ''}">
  <div>${eyebrow && html`<span class="eyebrow">${eyebrow}</span>`}<h2 id="${id}">${accent(title)}</h2>${lede && html`<p class="lede">${lede}</p>`}</div>
  ${action}
</div>`;

const chart = (lr, uid, label) => html`
<svg class="lrn-gd-svg" viewBox="${VIEWBOX}" role="img" aria-label="${label}" ${uid === 'gd' ? raw('data-gd-svg="gd"') : ''}>${raw(svgMarkup(lr, { uid }))}</svg>`;

const topicCard = (t) => html`
<article class="lrn-topic" style="--a:${t.colors[0]};--b:${t.colors[1]}">
  <div class="lrn-thumb" aria-hidden="true">${icon(t.icon)}<span class="chip frost">${t.programs.length} ${t.programs.length === 1 ? 'program' : 'programs'}</span></div>
  <div class="lrn-tbody">
    <h3><a href="${t.url}">${t.name}</a></h3>
    <p>${t.summary}</p>
    <ul class="lrn-codes" aria-label="Some of the lessons">
      ${t.concepts.slice(0, 3).map((c) => html`<li><span class="mono">${c.code}</span>${c.title}</li>`)}
    </ul>
    <span class="lrn-more" aria-hidden="true">What is ${t.lower}? ${icon('arrow')}</span>
  </div>
</article>`;

// =====================================================================================================
// /learn/
// =====================================================================================================

function hub(today) {
  const crumbs = [['/', 'Home'], ['/learn/', 'Topics']];
  const body = html`
${pageHead({ eyebrow: 'Topics', title: accent('Data and AI, *explained*'), crumbs,
    lede: 'Plain-English guides to the four areas Nuvora teaches: what each one is, the key concepts, the roles that use it and the programs that cover it. Then try a free sample lesson.',
    extra: html`<div class="row lrn-headlinks"><a class="btn gold" href="${SAMPLE}" data-cta="learn-sample">${icon('play')} Try the sample lesson</a><a class="btn ghost" href="#topics">Browse topics</a></div>` })}

<section class="sec" id="topics" aria-labelledby="lrn-topics-title">
  <div class="wrap">
    ${head({ id: 'lrn-topics-title', eyebrow: `${TOPIC_LIST.length} topics`, title: 'Pick a *topic*',
      lede: 'Each guide explains the field, lists the concepts you would learn with the Nuvora lesson and term that teaches each one, and links to the related roles and programs.' })}
    <div class="lrn-topics">${TOPIC_LIST.map(topicCard)}</div>
    <h3 class="lrn-chain-title">How the four fit together</h3>
    <ol class="lrn-chain">
      ${TOPIC_LIST.map((t) => html`<li><a href="${t.url}"><b>${t.name}</b><span>${t.chain}</span></a></li>`)}
    </ol>
  </div>
</section>

<section class="sec dark on-dark" aria-labelledby="lrn-sample-title">
  <div class="wrap split lrn-promo">
    <div class="stack">
      <span class="eyebrow">${icon('play')} Free sample lesson</span>
      <h2 id="lrn-sample-title">${accent('Try *gradient descent* for yourself')}</h2>
      <p class="lede">Gradient descent is how most machine learning models learn. This short lesson, in the style of our courses, explains the idea, lets you change the learning rate on a live chart, and ends with a three-question practice check.</p>
      <ul class="ticks lrn-ticks">
        <li>${icon('check')}<span>No sign-up and nothing to install</span></li>
        <li>${icon('check')}<span>An interactive chart that works with mouse, touch or keyboard</span></li>
        <li>${icon('check')}<span>A practice check with an explanation for every answer (not graded)</span></li>
      </ul>
      <div class="row"><a class="btn gold" href="${SAMPLE}" data-cta="learn-promo-sample">Start the sample lesson ${icon('arrow')}</a></div>
    </div>
    <figure class="lrn-chartcard">
      ${chart(0.2, 'gdp', 'Preview: the curve f(x) = x² with gradient descent steps moving from x = 2.6 down toward the minimum at 0')}
      <figcaption>A preview of the chart in the lesson, at learning rate 0.2</figcaption>
    </figure>
  </div>
</section>

<section class="sec" aria-labelledby="lrn-next-title">
  <div class="wrap">
    ${head({ id: 'lrn-next-title', eyebrow: 'Where next', title: 'From topics to *programs and careers*' })}
    <div class="lrn-next">
      <a class="lrn-nextcard" href="/careers/"><span class="lrn-nico">${icon('ladder')}</span><b>Career paths</b><span>Typical roles in data and AI, the skills each one uses, and the Nuvora lessons that teach them.</span><span class="link">Explore careers ${icon('arrow')}</span></a>
      <a class="lrn-nextcard" href="/programs/"><span class="lrn-nico">${icon('layers')}</span><b>All ${PROGRAMS.length} programs</b><span>Certificates, bachelor’s-level and master’s-level programs, compared side by side.</span><span class="link">Compare programs ${icon('arrow')}</span></a>
      <a class="lrn-nextcard" href="/find-your-program/"><span class="lrn-nico">${icon('target')}</span><b>Find my program</b><span>Four questions about your background, goal and time, and a match with the reasons behind it.</span><span class="link">Find my program ${icon('arrow')}</span></a>
    </div>
  </div>
</section>
${ctaBand()}`;

  return {
    path: '/learn/',
    html: page({
      path: '/learn/', today,
      title: 'Data science and AI topics, explained',
      description: 'Plain-English guides to data science, machine learning, generative AI and MLOps, with key concepts, related roles, Nuvora programs and a free sample lesson.',
      body,
      schema: [breadcrumbList(crumbs), itemList([...TOPIC_LIST.map((t) => [t.url, `What is ${t.lower}?`]), [SAMPLE, 'Sample lesson: gradient descent']])],
      styles: STYLES,
    }),
  };
}

// =====================================================================================================
// /learn/<topic>/
// =====================================================================================================

const conceptCard = (c) => html`
<li class="lrn-concept">
  <span class="lrn-code mono">${c.code}</span>
  <h3>${c.title}</h3>
  <p>${c.def}</p>
  <div class="lrn-where">
    <span class="lrn-k">Taught in</span>
    <ul>${c.where.map((w) => html`<li><a href="${w.p.url}#curriculum">${whereLabel(w)}</a></li>`)}</ul>
  </div>
</li>`;

function topicPage(t, today) {
  const crumbs = [['/', 'Home'], ['/learn/', 'Topics'], [t.url, t.name]];
  const faq = t.faq();
  const related = t.related.map(T).filter(Boolean);
  const tools = toolsFor(t.name);
  const jump = [['what', 'What it is'], ['concepts', 'Key concepts'], ['roles', 'Roles'], ['programs', 'Programs'], ['faq', 'FAQ']];
  const body = html`
${pageHead({ eyebrow: html`${icon(t.icon)} Topic guide`, title: accent(t.h1), lede: t.lede, crumbs,
    extra: html`<nav class="lrn-jump" aria-label="On this page">${jump.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav>` })}

<section class="sec" id="what" aria-labelledby="lrn-what-title">
  <div class="wrap lrn-what">
    <div class="lrn-prose">
      <h2 id="lrn-what-title">${accent(`${t.name} in *plain English*`)}</h2>
      ${t.what.map((p) => html`<p>${p}</p>`)}
    </div>
    <aside class="box lrn-glance" aria-labelledby="lrn-glance-title">
      <h3 id="lrn-glance-title">${icon('info')} At a glance</h3>
      <dl>
        <div><dt>Nuvora programs</dt><dd>${t.programs.map((p, i) => html`${i ? ', ' : ''}<a href="${p.url}">${p.short}</a>`)}</dd></div>
        <div><dt>Related roles</dt><dd>${t.roles.map((r, i) => html`${i ? ', ' : ''}<a href="/careers/${r}/">${ROLES[r].title}</a>`)}</dd></div>
        <div><dt>Tools in these programs</dt><dd class="row lrn-tools">${tools.map((x) => html`<span class="chip blue">${x}</span>`)}</dd></div>
        <div><dt>Related topics</dt><dd>${related.map((r, i) => html`${i ? ', ' : ''}<a href="${r.url}">${r.name}</a>`)}</dd></div>
      </dl>
    </aside>
  </div>
</section>

<section class="sec tinted" id="concepts" aria-labelledby="lrn-concepts-title">
  <div class="wrap">
    ${head({ id: 'lrn-concepts-title', eyebrow: 'Key concepts', title: 'What you would *learn*',
      lede: 'Core ideas in this area, each with the Nuvora lesson code and the program term that teaches it. The descriptions explain the idea itself; open a program to see its full curriculum.' })}
    <ul class="lrn-concepts">${t.concepts.map(conceptCard)}</ul>
  </div>
</section>

<section class="sec" id="roles" aria-labelledby="lrn-roles-title">
  <div class="wrap">
    ${head({ id: 'lrn-roles-title', eyebrow: 'Careers', title: `Roles that use *${t.lower}*`,
      lede: 'Open a role to see the skills it uses and the Nuvora lessons that teach each one.',
      action: html`<a class="link" href="/careers/">All career paths ${icon('arrow')}</a>` })}
    <div class="roles">${t.roles.map((r) => html`<a class="role" href="/careers/${r}/"><b>${ROLES[r].title}</b><span>${ROLES[r].summary}</span></a>`)}</div>
    <p class="note lrn-note">${CAREER_NOTE}</p>
  </div>
</section>

<section class="sec tinted" id="programs" aria-labelledby="lrn-programs-title">
  <div class="wrap">
    ${head({ id: 'lrn-programs-title', eyebrow: 'Programs', title: `Where Nuvora teaches *${t.lower}*`,
      lede: `Every program runs in 12-week terms with lessons you watch any time, a live class on ${SCHEDULE.classDay}s and office hours on ${SCHEDULE.officeDay}s, and three projects a term graded by instructors.`,
      action: html`<a class="link" href="/find-your-program/">Not sure which? Find my program ${icon('arrow')}</a>` })}
    <div class="cards">${t.programs.map(programCard)}</div>
  </div>
</section>

<section class="sec" id="faq" aria-labelledby="lrn-faq-title">
  <div class="wrap lrn-faqwrap">
    <div>
      ${head({ id: 'lrn-faq-title', eyebrow: 'Questions', title: `${t.name}: *straight answers*` })}
      ${faqList(faq)}
    </div>
    <aside class="lrn-related" aria-labelledby="lrn-related-title">
      <h2 id="lrn-related-title" class="lrn-h-sm">Keep exploring</h2>
      <ul>
        ${related.map((r) => html`<li><a href="${r.url}" style="--a:${r.colors[0]};--b:${r.colors[1]}"><span class="lrn-rico" aria-hidden="true">${icon(r.icon)}</span><span><b>${r.name}</b><span>${r.summary}</span></span></a></li>`)}
        <li><a href="${SAMPLE}" style="--a:#0866FF;--b:#6D5DF6"><span class="lrn-rico" aria-hidden="true">${icon('play')}</span><span><b>Sample lesson</b><span>Gradient descent, with an interactive chart and a practice check.</span></span></a></li>
      </ul>
    </aside>
  </div>
</section>
${ctaBand({ title: `Ready to study *${t.lower}*?` })}`;

  return {
    path: t.url,
    html: page({
      path: t.url, today,
      title: t.title,
      description: t.description,
      body,
      schema: [breadcrumbList(crumbs), faqPage(faq)],
      styles: STYLES,
    }),
  };
}

// =====================================================================================================
// /learn/sample-lesson/
// =====================================================================================================

function sampleLesson(today) {
  const crumbs = [['/', 'Home'], ['/learn/', 'Topics'], [SAMPLE, 'Sample lesson']];
  const ml = T('Machine Learning');
  // Where gradient methods are taught, straight from the catalog.
  const opt = TAUGHT.get('MTH-160');
  const calc = TAUGHT.get('MTH-120');
  const home = opt?.where[0];
  const hp = home?.p;
  const firstProject = home?.term.projects[0];
  // The worked example uses the same numbers as the chart's starting point.
  const ex = { lr: LR.initial, slope: 2 * START };
  ex.step = ex.lr * ex.slope;
  ex.next = START - ex.step;
  const slow = descend(0.05).xs;
  const slowLoss = slow[slow.length - 1] ** 2;

  const option = (qi, text, oi) => html`<label class="f-opt"><input type="radio" name="q${qi}" value="${oi}"><span>${text}</span></label>`;

  const body = html`
${pageHead({ eyebrow: html`${icon('play')} Free sample lesson`, title: accent('Gradient descent, *step by step*'), crumbs,
    lede: 'A sample lesson in the style of our courses: a short explanation, an interactive chart you control, and a three-question practice check. It is text and an interactive, not a video. No sign-up needed.',
    extra: html`<div class="row lrn-chips"><span class="chip frost">${icon('book')} Topic: ${ml ? ml.name : 'Machine Learning'}</span>${opt && html`<span class="chip frost">${icon('layers')} Taught in MTH-160 ${opt.title}</span>`}<span class="chip frost">${icon('lock')} Not graded · nothing is saved</span></div>` })}

<section class="sec" aria-labelledby="lrn-idea-title">
  <div class="wrap">
    ${head({ id: 'lrn-idea-title', eyebrow: 'The idea', title: 'Learning means going *downhill*',
      lede: 'Training a model means adjusting its numbers until its predictions are as good as they can get. Gradient descent is the method behind most of that adjusting, and it fits in one line.' })}
    <ol class="lrn-steps">
      <li><span class="lrn-sn" aria-hidden="true">1</span><h3>Measure the error</h3><p>A <b>loss function</b> turns “how wrong is the model?” into one number, where lower is better. Here we use the simplest one there is, <span class="mono">f(x) = x²</span>, whose lowest point is at x = 0.</p></li>
      <li><span class="lrn-sn" aria-hidden="true">2</span><h3>Find the slope</h3><p>The <b>derivative</b> <span class="mono">f′(x)</span> says which way is uphill and how steep it is. For x² it is <span class="mono">2x</span>, so at x = ${num(START, 1)} the slope is ${num(ex.slope, 1)}: steeply uphill to the right.</p></li>
      <li><span class="lrn-sn" aria-hidden="true">3</span><h3>Step the other way</h3><p>Move x a little in the direction opposite to the slope, then repeat. The <b>learning rate</b> <span class="mono">η</span> (the Greek letter eta) sets how big each step is.</p></li>
    </ol>
    <div class="lrn-formula">
      <p class="lrn-eq"><span class="sr-only">x becomes x minus eta times f prime of x</span><span aria-hidden="true">x</span><span class="lrn-op" aria-hidden="true">←</span><span aria-hidden="true">x</span><span class="lrn-op" aria-hidden="true">−</span><span class="lrn-eta" aria-hidden="true">η</span><span class="lrn-op" aria-hidden="true">·</span><span aria-hidden="true">f′(x)</span></p>
      <dl>
        <div><dt class="mono">x</dt><dd>The number being adjusted. A real model adjusts millions of them at once, each with the same rule.</dd></div>
        <div><dt class="mono">η</dt><dd>The learning rate: how far to step each time.</dd></div>
        <div><dt class="mono">f′(x)</dt><dd>The slope of the loss at x. Stepping against it goes downhill.</dd></div>
      </dl>
    </div>
    <div class="box lrn-worked">
      <h3>${icon('doc')} Worked example</h3>
      <p>Start at x = ${num(START, 1)} with η = ${ex.lr.toFixed(1)}. The slope is 2 × ${num(START, 1)} = ${num(ex.slope, 1)}, so the step is ${ex.lr.toFixed(1)} × ${num(ex.slope, 1)} = ${num(ex.step, 2)}, and x moves to ${num(START, 1)} − ${num(ex.step, 2)} = ${num(ex.next, 2)}. The loss falls from ${num(START ** 2, 2)} to about ${num(ex.next ** 2, 2)}. Do that again and again, and x closes in on 0.</p>
    </div>
  </div>
</section>

<section class="sec tinted" id="try" aria-labelledby="lrn-try-title">
  <div class="wrap">
    ${head({ id: 'lrn-try-title', eyebrow: 'Try it', title: 'Change the *learning rate*',
      lede: `Move the slider or pick a preset, then step through the updates one at a time. Every run starts at x = ${num(START, 1)} and takes up to 10 steps.` })}
    <div class="lrn-gd" data-gd>
      <div class="lrn-gd-controls" data-gd-js hidden>
        <div class="lrn-gd-lr">
          <label for="gd-lr">Learning rate <span class="mono">η</span> = <output class="mono" for="gd-lr" data-gd-value>${LR.initial.toFixed(2)}</output></label>
          <input id="gd-lr" type="range" min="${LR.min}" max="${LR.max}" step="${LR.step}" value="${LR.initial}" data-gd-lr aria-describedby="gd-lr-hint">
          <p class="small muted" id="gd-lr-hint">From ${LR.min} to ${LR.max}. With a keyboard, use the arrow keys to move in steps of ${LR.step}.</p>
        </div>
        <div class="lrn-gd-presets" role="group" aria-label="Learning rate presets">
          ${PRESETS.map(([v, label]) => html`<button type="button" data-gd-preset="${v}" aria-pressed="${v === LR.initial ? 'true' : 'false'}"><b class="mono">${v.toFixed(2)}</b><span>${label}</span></button>`)}
        </div>
        <div class="lrn-gd-actions">
          <button class="btn primary sm" type="button" data-gd-next>Next step</button>
          <button class="btn ghost sm" type="button" data-gd-all>Show all steps</button>
          <button class="btn ghost sm" type="button" data-gd-play aria-pressed="false">${icon('play')} Play the steps</button>
        </div>
      </div>
      <figure class="lrn-gd-fig">
        ${chart(LR.initial, 'gd', 'The curve f(x) = x² with the gradient descent steps for the chosen learning rate. The same steps are listed in the table of numbers below the chart.')}
        <figcaption class="lrn-legend">
          <span><i class="lrn-dot lrn-dot-start" aria-hidden="true"></i>Start, x = ${num(START, 1)}</span>
          <span><i class="lrn-dot lrn-dot-pt" aria-hidden="true"></i>Each step</span>
          <span><i class="lrn-dot lrn-dot-end" aria-hidden="true"></i>Where it ends</span>
        </figcaption>
        <noscript><p class="note">This chart shows η = ${LR.initial.toFixed(2)}. Turn on JavaScript to change the learning rate and step through the updates.</p></noscript>
      </figure>
      <p class="lrn-gd-read" data-gd-readout aria-live="polite">${readout(LR.initial)}</p>
      <details class="lrn-gd-table">
        <summary>The numbers behind the chart ${icon('down')}</summary>
        <div class="tablewrap"><table>
          <caption data-gd-caption>The numbers behind the chart at η = ${LR.initial.toFixed(2)}</caption>
          <thead><tr><th scope="col">Step</th><th scope="col">x</th><th scope="col">Slope 2x</th><th scope="col">Loss x²</th></tr></thead>
          <tbody data-gd-rows>${stepRows(LR.initial).map(([k, x, s, l]) => html`<tr><th scope="row">${k}</th><td>${x}</td><td>${s}</td><td>${l}</td></tr>`)}</tbody>
        </table></div>
      </details>
    </div>
  </div>
</section>

<section class="sec" aria-labelledby="lrn-shows-title">
  <div class="wrap">
    ${head({ id: 'lrn-shows-title', eyebrow: 'What to notice', title: 'Why the step size *matters*' })}
    <div class="lrn-regimes">
      <div class="box"><span class="chip blue">η below 0.5</span><h3>Small steps: steady but slow</h3><p>Every step lands on the same side of the minimum and the loss falls each time. At η = 0.05, ten steps still leave the loss at about ${num(slowLoss, 2)}.</p></div>
      <div class="box"><span class="chip blue">η between 0.5 and 1</span><h3>Big steps: zigzag</h3><p>Each step overshoots to the other side of the minimum. The jumps still shrink, so x settles, but it takes a wasteful route. At exactly 1 it bounces back and forth for ever.</p></div>
      <div class="box"><span class="chip blue">η above 1</span><h3>Too big: divergence</h3><p>Each overshoot is bigger than the last, so the loss grows instead of falling. In real training this looks like a loss that suddenly shoots up, and it is one of the first things to check.</p></div>
    </div>
    <div class="lrn-real">
      <h3>${icon('layers')} In real models</h3>
      <p>Real models adjust millions or billions of numbers at once, and their loss is far bumpier than a single curve, but the update rule is the same. That is why the learning rate is usually one of the first settings people tune, and why most training adds refinements such as learning-rate schedules, momentum and adaptive optimizers like Adam, which adjusts the step size for each parameter separately.</p>
    </div>
  </div>
</section>

<section class="sec tinted" id="practice" aria-labelledby="lrn-pc-title">
  <div class="wrap">
    ${head({ id: 'lrn-pc-title', eyebrow: 'Check your understanding', title: 'Practice check *(not graded)*',
      lede: 'Three questions on what you just tried. You will see your score out of 3 and an explanation for every question. Your answers are not saved or sent anywhere.' })}
    <form class="lrn-quiz" data-quiz novalidate aria-labelledby="lrn-pc-title">
      ${QUESTIONS.map((q, qi) => html`
      <fieldset class="lrn-q" data-q="${qi}">
        <legend><span class="lrn-qn" aria-hidden="true">${qi + 1}</span><span><span class="sr-only">Question ${qi + 1}: </span>${q.q}</span></legend>
        <div class="f-opts${q.options.every((o) => o.length < 12) ? ' three' : ' lrn-opts-long'}">${q.options.map((o, oi) => option(qi, o, oi))}</div>
        <p class="lrn-fb" data-fb hidden></p>
      </fieldset>`)}
      <div class="lrn-quiz-actions" data-quiz-js hidden>
        <button class="btn primary" type="submit">Check my answers</button>
        <button class="btn ghost" type="reset" data-quiz-reset hidden>Try again</button>
      </div>
      <div class="lrn-quiz-out" data-quiz-out></div>
      <noscript>
        <details class="lrn-key"><summary>Show the answers</summary>
          <ol>${QUESTIONS.map((q) => html`<li><b>${q.options[q.answer]}.</b> ${q.why}</li>`)}</ol>
        </details>
      </noscript>
    </form>
  </div>
</section>

${hp && html`
<section class="sec" id="taught" aria-labelledby="lrn-taught-title">
  <div class="wrap split lrn-taught">
    <div class="stack">
      <span class="eyebrow">Where Nuvora teaches this</span>
      <h2 id="lrn-taught-title">${accent('Go deeper in *MTH-160*')}</h2>
      <p class="lede">In the ${hp.name}, lesson MTH-160 ${opt.title} is part of term ${home.n} of ${hp.termCount}, ${home.term.title}.${firstProject ? ` The term’s first graded project, “${firstProject[0]}”, is due in week ${week(firstProject[1])}.` : ''}</p>
      <ul class="ticks">
        <li>${icon('check')}<span>Course lessons are videos that stream in the portal and cannot be downloaded. Lesson notes, exercise sheets and project briefs are PDFs you can keep.</span></li>
        <li>${icon('check')}<span>Projects are graded by an instructor on a four-level rubric. Proficient or better passes; below that you get written feedback and resubmit.</span></li>
        ${calc && html`<li>${icon('check')}<span>The calculus behind the slope is taught earlier, in MTH-120 ${calc.title} (${and(calc.where.map((w) => `${w.p.short}, term ${w.n}`))}).</span></li>`}
      </ul>
      <div class="row">
        <a class="btn gold" href="${hp.url}#curriculum" data-cta="sample-program">See the ${hp.short} curriculum ${icon('arrow')}</a>
        <a class="btn ghost" href="/find-your-program/" data-cta="sample-find">Find my program</a>
      </div>
      ${ml && html`<a class="link" href="${ml.url}">Read the machine learning topic guide ${icon('arrow')}</a>`}
    </div>
    <div class="cards lrn-onecard">${programCard(hp)}</div>
  </div>
</section>`}
${ctaBand({ title: 'Ready for the *full course*?' })}`;

  return {
    path: SAMPLE,
    html: page({
      path: SAMPLE, today,
      title: 'Free sample lesson: gradient descent, interactive',
      description: 'A free interactive sample lesson on gradient descent: a short explanation, a learning-rate chart you can control and a three-question practice check.',
      body,
      schema: [breadcrumbList(crumbs), {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: 'Gradient descent, step by step',
        description: 'A free sample lesson in the style of Nuvora courses: an explanation of gradient descent, an interactive learning-rate chart and an ungraded practice check.',
        url: SITE.origin + SAMPLE,
        inLanguage: 'en',
        isAccessibleForFree: true,
        learningResourceType: 'Interactive lesson',
        teaches: 'Gradient descent and the effect of the learning rate',
        provider: { '@id': `${SITE.origin}/#organization` },
      }],
      scripts: ['/js/sample-lesson.js'],
      styles: STYLES,
    }),
  };
}

export default function learn({ today } = {}) {
  return [hub(today), ...TOPIC_LIST.map((t) => topicPage(t, today)), sampleLesson(today)];
}
