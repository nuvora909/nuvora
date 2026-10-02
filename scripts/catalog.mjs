// The Nuvora catalog: programs, their modules and lessons, live class pattern and assignments.
// `npm run seed:build` turns this into supabase/seed.sql. Edit here, not in the SQL.

export const PROGRAMS = [
  { id: 'bs-ds', name: 'B.S. Data Science', level: 'Bachelor', credits: 120,
    modules: [
      ['Math foundations', [['MTH-110','Linear algebra for data'],['MTH-120','Calculus for optimization'],['STA-130','Probability'],['STA-140','Inferential statistics']]],
      ['Programming', [['PRG-101','Python fundamentals'],['PRG-120','Data structures in Python'],['DBS-130','SQL & relational modeling'],['PRG-150','Version control & testing']]],
      ['Analysis & modeling', [['DAT-210','Exploratory data analysis'],['DAT-230','Regression & GLMs'],['DAT-250','Experiment design & A/B tests'],['ML-270','Supervised learning']]],
      ['Communication', [['VIS-220','Data visualization'],['VIS-240','Dashboards & storytelling'],['ETH-260','Data ethics & privacy']]],
    ],
    assignments: [['Project 1: Exploratory analysis of a public dataset', 18], ['Project 2: A/B test design and analysis', 46], ['Capstone: Decision memo with a live dashboard', 81]] },
  { id: 'bs-aiml', name: 'B.S. Artificial Intelligence & Machine Learning', level: 'Bachelor', credits: 120,
    modules: [
      ['Math foundations', [['MTH-110','Linear algebra for data'],['MTH-120','Calculus for optimization'],['STA-130','Probability'],['MTH-160','Optimization & gradient methods']]],
      ['Core ML', [['ML-210','Supervised learning'],['ML-220','Unsupervised learning'],['ML-230','Model evaluation & validation'],['ML-240','Feature engineering']]],
      ['Deep learning', [['DL-310','Neural networks from scratch'],['DL-320','Computer vision with CNNs'],['DL-330','Sequence models & transformers'],['DL-340','Fine-tuning pretrained models']]],
      ['AI systems', [['AIS-410','LLM application design'],['AIS-420','Retrieval-augmented generation'],['AIS-430','Evaluation & red-teaming'],['OPS-440','Serving & monitoring models']]],
    ],
    assignments: [['Project 1: Gradient descent from scratch', 18], ['Project 2: Train and evaluate a classifier', 46], ['Capstone: Ship an ML system with a model card', 81]] },
  { id: 'ms-aml', name: 'M.S. Applied Machine Learning', level: 'Master', credits: 36,
    modules: [
      ['Advanced modeling', [['ML-610','Probabilistic ML'],['DL-620','Deep learning architectures'],['ML-630','Causal inference for ML']]],
      ['ML systems', [['OPS-640','Distributed training'],['OPS-650','MLOps & continuous training'],['AIS-660','LLM systems engineering']]],
      ['Responsible AI', [['ETH-670','Fairness, safety & governance'],['AIS-680','Evaluation at scale']]],
    ],
    assignments: [['Project 1: Reproduce a paper result', 18], ['Project 2: Production training pipeline', 46], ['Capstone: Industry project defense', 81]] },
  { id: 'ms-ds', name: 'M.S. Data Science & Analytics', level: 'Master', credits: 36,
    modules: [
      ['Statistics', [['STA-610','Bayesian data analysis'],['STA-620','Time-series forecasting'],['STA-630','Causal inference']]],
      ['Data at scale', [['DEN-640','Data engineering pipelines'],['DEN-650','Cloud warehouses & lakehouses']]],
      ['Strategy', [['DAT-660','Experimentation platforms'],['LDR-670','Leading data teams'],['ETH-680','Data governance']]],
    ],
    assignments: [['Project 1: Forecasting system', 18], ['Project 2: Experimentation platform design', 46], ['Capstone: Executive decision brief', 81]] },
  { id: 'c-py', name: 'Certificate in Python & Data Analysis', level: 'Certificate', credits: 15,
    modules: [['Core', [['PRG-101','Python fundamentals'],['DBS-130','SQL & relational modeling'],['DAT-210','Exploratory data analysis'],['VIS-220','Data visualization'],['DAT-199','Portfolio project']]]],
    assignments: [['Project 1: Clean and analyze a dataset', 18], ['Portfolio project: Published notebook', 46]] },
  { id: 'c-genai', name: 'Certificate in Generative AI & LLM Apps', level: 'Certificate', credits: 15,
    modules: [['Core', [['AIS-410','LLM application design'],['AIS-420','Retrieval-augmented generation'],['AIS-425','Tool use & agents'],['AIS-430','Evaluation & red-teaming'],['AIS-199','Shipped LLM project']]]],
    assignments: [['Project 1: RAG app with citations', 18], ['Final project: LLM app with an eval suite', 46]] },
  { id: 'c-mlops', name: 'Certificate in MLOps & Data Engineering', level: 'Certificate', credits: 18,
    modules: [['Core', [['DEN-640','Data engineering pipelines'],['DEN-645','Orchestration with Airflow'],['OPS-440','Serving & monitoring models'],['OPS-650','MLOps & continuous training'],['OPS-455','Infrastructure as code'],['OPS-199','Production pipeline project']]]],
    assignments: [['Project 1: Orchestrated pipeline', 18], ['Final project: Monitored, retrainable model', 46]] },
];

// ============================================================================
// Program plans as a sequence of 12-week terms (one term = one monthly batch of that program stage).
// Decided by the owner on 2026-10-02: Bachelor's 120 credits = 12 terms (3–4 years part-time),
// Master's 36 credits = 4 terms (12–18 months), certificates = 1 term. Each term has four competency
// lessons and three graded projects (due on days 18, 46 and 81 of the batch).
// (The `modules`/`assignments` fields above are the original single-batch view, still used by the
// current seed until the database moves to terms.)
// ============================================================================
const PROJECT_DAYS = [18, 46, 81];
const term = (title, lessons, projects) => ({
  title,
  lessons,
  projects: (projects ?? [
    `${lessons[0][1]} in practice`,
    `${lessons[1][1]} and ${lessons[2][1].toLowerCase()}`,
    `Term project: ${title.toLowerCase()}`,
  ]).map((t, i) => [t, PROJECT_DAYS[i]]),
});
const capstone = (lessons, projects) => term('Capstone', lessons, projects);

export const TERMS = {
  'bs-ds': [
    term('Python for data', [['PRG-101', 'Python fundamentals'], ['PRG-120', 'Data structures in Python'], ['PRG-150', 'Version control & testing'], ['DAT-110', 'Working with data files']]),
    term('Mathematics for data', [['MTH-110', 'Linear algebra for data'], ['MTH-120', 'Calculus for optimization'], ['MTH-130', 'Discrete mathematics'], ['MTH-140', 'Numerical methods']]),
    term('Probability & statistics', [['STA-130', 'Probability'], ['STA-140', 'Inferential statistics'], ['STA-150', 'Sampling & surveys'], ['STA-160', 'Statistical computing']]),
    term('Databases & SQL', [['DBS-130', 'SQL & relational modeling'], ['DBS-140', 'Advanced SQL & window functions'], ['DBS-150', 'Data modeling for analytics'], ['DBS-160', 'Data quality & testing']]),
    term('Exploration & visualization', [['DAT-210', 'Exploratory data analysis'], ['VIS-220', 'Data visualization'], ['VIS-240', 'Dashboards & storytelling'], ['DAT-215', 'From spreadsheets to Python']]),
    term('Regression & modeling', [['DAT-230', 'Regression & GLMs'], ['DAT-235', 'Model diagnostics'], ['DAT-240', 'Time-series basics'], ['ML-270', 'Supervised learning']]),
    term('Experimentation', [['DAT-250', 'Experiment design & A/B tests'], ['STA-255', 'Causal thinking for analysts'], ['DAT-260', 'Metrics & KPIs'], ['DAT-265', 'Product analytics']]),
    term('Machine learning for analysts', [['ML-280', 'Unsupervised learning'], ['ML-285', 'Model evaluation'], ['ML-290', 'Feature engineering'], ['ML-295', 'Interpretable ML']]),
    term('Data engineering basics', [['DEN-310', 'Data pipelines'], ['DEN-320', 'Cloud data warehouses'], ['DEN-330', 'Transformation with dbt'], ['DEN-340', 'Orchestration basics']]),
    term('Communication & ethics', [['ETH-260', 'Data ethics & privacy'], ['COM-350', 'Writing for decision makers'], ['COM-360', 'Presenting data'], ['LDR-370', 'Working with stakeholders']]),
    term('Applied domains', [['DOM-410', 'Marketing analytics'], ['DOM-420', 'Financial analytics'], ['DOM-430', 'Healthcare data'], ['DOM-440', 'Geospatial analysis']]),
    capstone([['CAP-491', 'Scoping & proposal'], ['CAP-492', 'Analysis & modeling'], ['CAP-493', 'Dashboard & decision memo'], ['CAP-494', 'Final presentation']],
      ['Capstone proposal', 'Capstone analysis checkpoint', 'Capstone: decision memo with a live dashboard']),
  ],
  'bs-aiml': [
    term('Python & computing', [['PRG-101', 'Python fundamentals'], ['PRG-120', 'Data structures in Python'], ['PRG-150', 'Version control & testing'], ['PRG-160', 'Algorithms & complexity']]),
    term('Mathematics for ML', [['MTH-110', 'Linear algebra for data'], ['MTH-120', 'Calculus for optimization'], ['MTH-130', 'Discrete mathematics'], ['MTH-140', 'Numerical methods']]),
    term('Probability & optimization', [['STA-130', 'Probability'], ['STA-140', 'Inferential statistics'], ['MTH-160', 'Optimization & gradient methods'], ['STA-170', 'Information theory basics']],
      ['Gradient descent from scratch', 'Probability and inference in practice', 'Term project: optimization lab']),
    term('Data for ML', [['DBS-130', 'SQL & relational modeling'], ['DAT-210', 'Exploratory data analysis'], ['VIS-220', 'Data visualization'], ['DAT-220', 'Data cleaning at scale']]),
    term('Core machine learning I', [['ML-210', 'Supervised learning'], ['ML-220', 'Unsupervised learning'], ['ML-230', 'Model evaluation & validation'], ['ML-240', 'Feature engineering']],
      ['Train and evaluate a classifier', 'Clustering and evaluation', 'Term project: an end-to-end ML model']),
    term('Core machine learning II', [['ML-250', 'Ensemble methods'], ['ML-260', 'Probabilistic models'], ['ML-265', 'Recommender systems'], ['ML-275', 'Time-series ML']]),
    term('Deep learning I', [['DL-310', 'Neural networks from scratch'], ['DL-315', 'Training deep networks'], ['DL-320', 'Computer vision with CNNs'], ['DL-325', 'PyTorch in practice']]),
    term('Deep learning II', [['DL-330', 'Sequence models & transformers'], ['DL-340', 'Fine-tuning pretrained models'], ['DL-345', 'Generative models'], ['DL-350', 'Efficient deep learning']]),
    term('AI systems', [['AIS-410', 'LLM application design'], ['AIS-420', 'Retrieval-augmented generation'], ['AIS-425', 'Tool use & agents'], ['AIS-430', 'Evaluation & red-teaming']]),
    term('MLOps', [['OPS-440', 'Serving & monitoring models'], ['OPS-445', 'ML pipelines'], ['OPS-450', 'Experiment tracking'], ['OPS-455', 'Infrastructure as code']]),
    term('Responsible AI & electives', [['ETH-460', 'Fairness & safety'], ['ETH-470', 'AI governance'], ['ELE-480', 'Reinforcement learning'], ['ELE-485', 'Applied computer vision']]),
    capstone([['CAP-491', 'Scoping & proposal'], ['CAP-492', 'Build & evaluate'], ['CAP-493', 'Model card & monitoring'], ['CAP-494', 'Final demo']],
      ['Capstone proposal', 'Capstone evaluation checkpoint', 'Capstone: ship an ML system with a model card']),
  ],
  'ms-aml': [
    term('Advanced modeling', [['ML-610', 'Probabilistic ML'], ['DL-620', 'Deep learning architectures'], ['ML-630', 'Causal inference for ML'], ['ML-640', 'Research methods & reproducibility']],
      ['Reproduce a paper result', 'Causal analysis of a real dataset', 'Term project: architecture comparison']),
    term('ML systems', [['OPS-640', 'Distributed training'], ['OPS-650', 'MLOps & continuous training'], ['AIS-660', 'LLM systems engineering'], ['OPS-665', 'Feature stores & data contracts']],
      ['Production training pipeline', 'LLM system with evaluations', 'Term project: continuous training loop']),
    term('Responsible AI at scale', [['ETH-670', 'Fairness, safety & governance'], ['AIS-680', 'Evaluation at scale'], ['OPS-690', 'Reliability & incident response'], ['ETH-695', 'Privacy-preserving ML']]),
    capstone([['CAP-691', 'Problem framing'], ['CAP-692', 'Build & evaluate'], ['CAP-693', 'Deployment plan'], ['CAP-694', 'Defense']],
      ['Capstone proposal', 'Capstone build checkpoint', 'Capstone: industry-scale project defense']),
  ],
  'ms-ds': [
    term('Advanced statistics', [['STA-610', 'Bayesian data analysis'], ['STA-620', 'Time-series forecasting'], ['STA-630', 'Causal inference'], ['STA-640', 'Multilevel models']],
      ['Forecasting system', 'Bayesian analysis report', 'Term project: causal study']),
    term('Data at scale', [['DEN-640', 'Data engineering pipelines'], ['DEN-650', 'Cloud warehouses & lakehouses'], ['DEN-655', 'Streaming data'], ['DEN-660', 'Data platform design']]),
    term('Strategy & leadership', [['DAT-660', 'Experimentation platforms'], ['LDR-670', 'Leading data teams'], ['ETH-680', 'Data governance'], ['LDR-690', 'Analytics strategy']],
      ['Experimentation platform design', 'Data governance plan', 'Term project: analytics strategy']),
    capstone([['CAP-691', 'Problem framing'], ['CAP-692', 'Analysis & experiment'], ['CAP-693', 'Recommendation'], ['CAP-694', 'Executive presentation']],
      ['Capstone proposal', 'Capstone analysis checkpoint', 'Capstone: executive decision brief']),
  ],
  'c-py': [term('Python & data analysis', [['PRG-101', 'Python fundamentals'], ['DBS-130', 'SQL & relational modeling'], ['DAT-210', 'Exploratory data analysis'], ['VIS-220', 'Data visualization']],
    ['Clean and analyze a dataset', 'SQL and visualization report', 'Portfolio project: published notebook'])],
  'c-genai': [term('Generative AI & LLM apps', [['AIS-410', 'LLM application design'], ['AIS-420', 'Retrieval-augmented generation'], ['AIS-425', 'Tool use & agents'], ['AIS-430', 'Evaluation & red-teaming']],
    ['RAG app with citations', 'Agent with tool use', 'Final project: LLM app with an eval suite'])],
  'c-mlops': [term('MLOps & data engineering', [['DEN-640', 'Data engineering pipelines'], ['DEN-645', 'Orchestration with Airflow'], ['OPS-440', 'Serving & monitoring models'], ['OPS-650', 'MLOps & continuous training']],
    ['Orchestrated pipeline', 'Model serving with monitoring', 'Final project: monitored, retrainable model'])],
};

// Tuition (owner-confirmed launch pricing, 2026-10-02): a flat price per 12-week term, plus a one-time
// application fee. Students pay term by term.
export const TUITION = { perTerm: { Bachelor: 1950, Certificate: 1950, Master: 2450 }, applicationFee: 60, currency: 'USD' };

// Live schedule for every batch: 12 weeks, a live class on Tuesday and office hours on Thursday (batch time zone).
export const LIVE_PATTERN = { weeks: 12, classDay: 2, classTime: '19:00', classMinutes: 60, officeDay: 4, officeTime: '19:00', officeMinutes: 45 };
export const TIMEZONE = 'Asia/Kolkata';
export const CAPACITY = 60;
