// The Nuvora catalog: programs, their terms (lessons and graded projects), live class pattern and tuition.
// `npm run seed` turns this into supabase/seed.sql. Edit here, not in the SQL.

export const PROGRAMS = [
  { id: 'bs-ds', name: 'B.S. Data Science', level: 'Bachelor', credits: 120 },
  { id: 'bs-aiml', name: 'B.S. Artificial Intelligence & Machine Learning', level: 'Bachelor', credits: 120 },
  { id: 'ms-aml', name: 'M.S. Applied Machine Learning', level: 'Master', credits: 36 },
  { id: 'ms-ds', name: 'M.S. Data Science & Analytics', level: 'Master', credits: 36 },
  { id: 'c-py', name: 'Certificate in Python & Data Analysis', level: 'Certificate', credits: 15 },
  { id: 'c-genai', name: 'Certificate in Generative AI & LLM Apps', level: 'Certificate', credits: 15 },
  { id: 'c-mlops', name: 'Certificate in MLOps & Data Engineering', level: 'Certificate', credits: 18 },
];

// ============================================================================
// Program plans as a sequence of 12-week terms (one term = one monthly batch of that program stage).
// Decided by the owner on 2026-10-02: Bachelor's 120 credits = 12 terms (3â€“4 years part-time),
// Master's 36 credits = 4 terms (12â€“18 months), certificates = 1 term. Each term has four competency
// lessons and three graded projects (due on days 18, 46 and 81 of the batch).
// `badge` is the skill badge a student earns in the portal by completing every lesson of the term and
// passing all three projects (Proficient or Distinguished). Badge names describe skills, never job titles.
// ============================================================================
const PROJECT_DAYS = [18, 46, 81];
// Which project assesses each of a term's four lessons (by position): project 1 the first lesson,
// project 2 the second and third, the term project the fourth. Used for "mastered" in the competency map.
export const PROJECT_FOR_LESSON = [0, 1, 1, 2];
const term = (title, badge, lessons, projects) => ({
  title,
  badge,
  lessons,
  projects: (projects ?? [
    `${lessons[0][1]} in practice`,
    `${lessons[1][1]} and ${lessons[2][1].toLowerCase()}`,
    `Term project: ${title.toLowerCase()}`,
  ]).map((t, i) => [t, PROJECT_DAYS[i]]),
});
const capstone = (badge, lessons, projects) => term('Capstone', badge, lessons, projects);

export const TERMS = {
  'bs-ds': [
    term('Python for data', 'Python Proficiency', [['PRG-101', 'Python fundamentals'], ['PRG-120', 'Data structures in Python'], ['PRG-150', 'Version control & testing'], ['DAT-110', 'Working with data files']]),
    term('Mathematics for data', 'Math Foundations', [['MTH-110', 'Linear algebra for data'], ['MTH-120', 'Calculus for optimization'], ['MTH-130', 'Discrete mathematics'], ['MTH-140', 'Numerical methods']]),
    term('Probability & statistics', 'Statistical Thinking', [['STA-130', 'Probability'], ['STA-140', 'Inferential statistics'], ['STA-150', 'Sampling & surveys'], ['STA-160', 'Statistical computing']]),
    term('Databases & SQL', 'SQL Fluency', [['DBS-130', 'SQL & relational modeling'], ['DBS-140', 'Advanced SQL & window functions'], ['DBS-150', 'Data modeling for analytics'], ['DBS-160', 'Data quality & testing']]),
    term('Exploration & visualization', 'Data Storytelling', [['DAT-210', 'Exploratory data analysis'], ['VIS-220', 'Data visualization'], ['VIS-240', 'Dashboards & storytelling'], ['DAT-215', 'From spreadsheets to Python']]),
    term('Regression & modeling', 'Regression Modeling', [['DAT-230', 'Regression & GLMs'], ['DAT-235', 'Model diagnostics'], ['DAT-240', 'Time-series basics'], ['ML-270', 'Supervised learning']]),
    term('Experimentation', 'Experiment Design', [['DAT-250', 'Experiment design & A/B tests'], ['STA-255', 'Causal thinking for analysts'], ['DAT-260', 'Metrics & KPIs'], ['DAT-265', 'Product analytics']]),
    term('Machine learning for analysts', 'ML Foundations', [['ML-280', 'Unsupervised learning'], ['ML-285', 'Model evaluation'], ['ML-290', 'Feature engineering'], ['ML-295', 'Interpretable ML']]),
    term('Data engineering basics', 'Data Pipelines', [['DEN-310', 'Data pipelines'], ['DEN-320', 'Cloud data warehouses'], ['DEN-330', 'Transformation with dbt'], ['DEN-340', 'Orchestration basics']]),
    term('Communication & ethics', 'Responsible Communication', [['ETH-260', 'Data ethics & privacy'], ['COM-350', 'Writing for decision makers'], ['COM-360', 'Presenting data'], ['LDR-370', 'Working with stakeholders']]),
    term('Applied domains', 'Applied Analytics', [['DOM-410', 'Marketing analytics'], ['DOM-420', 'Financial analytics'], ['DOM-430', 'Healthcare data'], ['DOM-440', 'Geospatial analysis']]),
    capstone('Data Science Capstone', [['CAP-491', 'Scoping & proposal'], ['CAP-492', 'Analysis & modeling'], ['CAP-493', 'Dashboard & decision memo'], ['CAP-494', 'Final presentation']],
      ['Capstone proposal', 'Capstone analysis checkpoint', 'Capstone: decision memo with a live dashboard']),
  ],
  'bs-aiml': [
    term('Python & computing', 'Python Proficiency', [['PRG-101', 'Python fundamentals'], ['PRG-120', 'Data structures in Python'], ['PRG-150', 'Version control & testing'], ['PRG-160', 'Algorithms & complexity']]),
    term('Mathematics for ML', 'Math for ML', [['MTH-110', 'Linear algebra for data'], ['MTH-120', 'Calculus for optimization'], ['MTH-130', 'Discrete mathematics'], ['MTH-140', 'Numerical methods']]),
    term('Probability & optimization', 'Optimization Basics', [['STA-130', 'Probability'], ['STA-140', 'Inferential statistics'], ['MTH-160', 'Optimization & gradient methods'], ['STA-170', 'Information theory basics']],
      ['Gradient descent from scratch', 'Probability and inference in practice', 'Term project: optimization lab']),
    term('Data for ML', 'Data Preparation', [['DBS-130', 'SQL & relational modeling'], ['DAT-210', 'Exploratory data analysis'], ['VIS-220', 'Data visualization'], ['DAT-220', 'Data cleaning at scale']]),
    term('Core machine learning I', 'ML Foundations', [['ML-210', 'Supervised learning'], ['ML-220', 'Unsupervised learning'], ['ML-230', 'Model evaluation & validation'], ['ML-240', 'Feature engineering']],
      ['Train and evaluate a classifier', 'Clustering and evaluation', 'Term project: an end-to-end ML model']),
    term('Core machine learning II', 'Applied ML', [['ML-250', 'Ensemble methods'], ['ML-260', 'Probabilistic models'], ['ML-265', 'Recommender systems'], ['ML-275', 'Time-series ML']]),
    term('Deep learning I', 'Deep Learning Foundations', [['DL-310', 'Neural networks from scratch'], ['DL-315', 'Training deep networks'], ['DL-320', 'Computer vision with CNNs'], ['DL-325', 'PyTorch in practice']]),
    term('Deep learning II', 'Modern Deep Learning', [['DL-330', 'Sequence models & transformers'], ['DL-340', 'Fine-tuning pretrained models'], ['DL-345', 'Generative models'], ['DL-350', 'Efficient deep learning']]),
    term('AI systems', 'LLM Systems', [['AIS-410', 'LLM application design'], ['AIS-420', 'Retrieval-augmented generation'], ['AIS-425', 'Tool use & agents'], ['AIS-430', 'Evaluation & red-teaming']]),
    term('MLOps', 'Production ML', [['OPS-440', 'Serving & monitoring models'], ['OPS-445', 'ML pipelines'], ['OPS-450', 'Experiment tracking'], ['OPS-455', 'Infrastructure as code']]),
    term('Responsible AI & electives', 'Responsible AI', [['ETH-460', 'Fairness & safety'], ['ETH-470', 'AI governance'], ['ELE-480', 'Reinforcement learning'], ['ELE-485', 'Applied computer vision']]),
    capstone('AI Practitioner', [['CAP-491', 'Scoping & proposal'], ['CAP-492', 'Build & evaluate'], ['CAP-493', 'Model card & monitoring'], ['CAP-494', 'Final demo']],
      ['Capstone proposal', 'Capstone evaluation checkpoint', 'Capstone: ship an ML system with a model card']),
  ],
  'ms-aml': [
    term('Advanced modeling', 'Advanced Modeling', [['ML-610', 'Probabilistic ML'], ['DL-620', 'Deep learning architectures'], ['ML-630', 'Causal inference for ML'], ['ML-640', 'Research methods & reproducibility']],
      ['Reproduce a paper result', 'Causal analysis of a real dataset', 'Term project: architecture comparison']),
    term('ML systems', 'ML Systems at Scale', [['OPS-640', 'Distributed training'], ['OPS-650', 'MLOps & continuous training'], ['AIS-660', 'LLM systems engineering'], ['OPS-665', 'Feature stores & data contracts']],
      ['Production training pipeline', 'LLM system with evaluations', 'Term project: continuous training loop']),
    term('Responsible AI at scale', 'Responsible AI at Scale', [['ETH-670', 'Fairness, safety & governance'], ['AIS-680', 'Evaluation at scale'], ['OPS-690', 'Reliability & incident response'], ['ETH-695', 'Privacy-preserving ML']]),
    capstone('Industry Capstone', [['CAP-691', 'Problem framing'], ['CAP-692', 'Build & evaluate'], ['CAP-693', 'Deployment plan'], ['CAP-694', 'Defense']],
      ['Capstone proposal', 'Capstone build checkpoint', 'Capstone: industry-scale project defense']),
  ],
  'ms-ds': [
    term('Advanced statistics', 'Advanced Statistics', [['STA-610', 'Bayesian data analysis'], ['STA-620', 'Time-series forecasting'], ['STA-630', 'Causal inference'], ['STA-640', 'Multilevel models']],
      ['Forecasting system', 'Bayesian analysis report', 'Term project: causal study']),
    term('Data at scale', 'Data at Scale', [['DEN-640', 'Data engineering pipelines'], ['DEN-650', 'Cloud warehouses & lakehouses'], ['DEN-655', 'Streaming data'], ['DEN-660', 'Data platform design']]),
    term('Strategy & leadership', 'Analytics Strategy', [['DAT-660', 'Experimentation platforms'], ['LDR-670', 'Leading data teams'], ['ETH-680', 'Data governance'], ['LDR-690', 'Analytics strategy']],
      ['Experimentation platform design', 'Data governance plan', 'Term project: analytics strategy']),
    capstone('Executive Capstone', [['CAP-691', 'Problem framing'], ['CAP-692', 'Analysis & experiment'], ['CAP-693', 'Recommendation'], ['CAP-694', 'Executive presentation']],
      ['Capstone proposal', 'Capstone analysis checkpoint', 'Capstone: executive decision brief']),
  ],
  'c-py': [term('Python & data analysis', 'Python Data Analysis', [['PRG-101', 'Python fundamentals'], ['DBS-130', 'SQL & relational modeling'], ['DAT-210', 'Exploratory data analysis'], ['VIS-220', 'Data visualization']],
    ['Clean and analyze a dataset', 'SQL and visualization report', 'Portfolio project: published notebook'])],
  'c-genai': [term('Generative AI & LLM apps', 'LLM App Builder', [['AIS-410', 'LLM application design'], ['AIS-420', 'Retrieval-augmented generation'], ['AIS-425', 'Tool use & agents'], ['AIS-430', 'Evaluation & red-teaming']],
    ['RAG app with citations', 'Agent with tool use', 'Final project: LLM app with an eval suite'])],
  'c-mlops': [term('MLOps & data engineering', 'Pipeline to Production', [['DEN-640', 'Data engineering pipelines'], ['DEN-645', 'Orchestration with Airflow'], ['OPS-440', 'Serving & monitoring models'], ['OPS-650', 'MLOps & continuous training']],
    ['Orchestrated pipeline', 'Model serving with monitoring', 'Final project: monitored, retrainable model'])],
};

// Tuition (owner-confirmed launch pricing, 2026-10-02): a flat price per 12-week term, plus a one-time
// application fee. Students pay term by term.
export const TUITION = { perTerm: { Bachelor: 1950, Certificate: 1950, Master: 2450 }, applicationFee: 60, currency: 'USD' };

// Live schedule for every batch: 12 weeks, a live class on Tuesday and office hours on Thursday (batch time zone).
export const LIVE_PATTERN = { weeks: 12, classDay: 2, classTime: '19:00', classMinutes: 60, officeDay: 4, officeTime: '19:00', officeMinutes: 45 };
export const TIMEZONE = 'America/New_York';
export const CAPACITY = 60;
