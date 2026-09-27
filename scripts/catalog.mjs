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

// Live schedule for every batch: 12 weeks, a live class on Tuesday and office hours on Thursday (batch time zone).
export const LIVE_PATTERN = { weeks: 12, classDay: 2, classTime: '19:00', classMinutes: 60, officeDay: 4, officeTime: '19:00', officeMinutes: 45 };
export const TIMEZONE = 'Asia/Kolkata';
export const CAPACITY = 60;
