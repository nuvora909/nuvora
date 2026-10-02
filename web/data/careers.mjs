// Career pathways: typical role progressions in the industry and the skills each role uses, mapped to the
// Nuvora lessons that teach them. These describe the field, not results: Nuvora does not promise jobs,
// promotions or salaries.
export const CAREER_NOTE = 'Typical progressions in the industry. Your path depends on your experience and the market; Nuvora does not guarantee jobs or promotions.';

export const ROLES = {
  'data-analyst': {
    title: 'Data Analyst',
    summary: 'Turns raw data into answers: cleans data, queries databases and builds charts and dashboards that teams use to decide.',
    skills: [['SQL querying', 'DBS-130'], ['Python for data', 'PRG-101'], ['Exploratory analysis', 'DAT-210'], ['Data visualization', 'VIS-220'], ['Dashboards & storytelling', 'VIS-240']],
    tools: ['SQL', 'Python', 'pandas', 'Tableau or Looker', 'Spreadsheets'],
    programs: ['c-py', 'bs-ds'],
  },
  'senior-data-analyst': {
    title: 'Senior Data Analyst',
    summary: 'Owns analyses end to end: designs experiments, models outcomes and explains trade-offs to decision makers.',
    skills: [['Experiment design & A/B tests', 'DAT-250'], ['Regression modeling', 'DAT-230'], ['Metrics & KPIs', 'DAT-260'], ['Writing for decision makers', 'COM-350']],
    tools: ['SQL', 'Python', 'Experimentation tools', 'dbt'],
    programs: ['bs-ds', 'ms-ds'],
  },
  'data-scientist': {
    title: 'Data Scientist',
    summary: 'Builds statistical and machine learning models to predict, forecast and explain, and checks that they hold up.',
    skills: [['Supervised learning', 'ML-270'], ['Model evaluation', 'ML-285'], ['Causal inference', 'STA-630'], ['Time-series forecasting', 'STA-620']],
    tools: ['Python', 'scikit-learn', 'SQL', 'Jupyter'],
    programs: ['bs-ds', 'ms-ds'],
  },
  'analytics-manager': {
    title: 'Analytics Manager',
    summary: 'Leads a data team: sets priorities, runs the experimentation programme and owns data governance.',
    skills: [['Leading data teams', 'LDR-670'], ['Experimentation platforms', 'DAT-660'], ['Data governance', 'ETH-680'], ['Analytics strategy', 'LDR-690']],
    tools: ['SQL', 'BI platforms', 'Planning tools'],
    programs: ['ms-ds'],
  },
  'ml-ai-specialist': {
    title: 'ML / AI Specialist',
    summary: 'Applies machine learning to business problems: frames the task, trains and evaluates models and explains results.',
    skills: [['Supervised learning', 'ML-210'], ['Model evaluation & validation', 'ML-230'], ['Feature engineering', 'ML-240'], ['LLM application design', 'AIS-410']],
    tools: ['Python', 'scikit-learn', 'PyTorch', 'LLM APIs'],
    programs: ['bs-aiml', 'c-genai'],
  },
  'ml-engineer': {
    title: 'ML Engineer',
    summary: 'Builds machine learning systems that run in production: training pipelines, serving, monitoring and retraining.',
    skills: [['Neural networks', 'DL-310'], ['ML pipelines', 'OPS-445'], ['Serving & monitoring models', 'OPS-440'], ['MLOps & continuous training', 'OPS-650']],
    tools: ['PyTorch', 'Docker', 'Kubernetes', 'MLflow'],
    programs: ['bs-aiml', 'ms-aml', 'c-mlops'],
  },
  'ai-engineer': {
    title: 'AI Engineer',
    summary: 'Builds products on large language models: retrieval, tools and agents, with evaluations that catch failures.',
    skills: [['LLM application design', 'AIS-410'], ['Retrieval-augmented generation', 'AIS-420'], ['Tool use & agents', 'AIS-425'], ['Evaluation & red-teaming', 'AIS-430']],
    tools: ['Python', 'LLM APIs', 'Vector databases', 'Evaluation tools'],
    programs: ['c-genai', 'bs-aiml', 'ms-aml'],
  },
  'ai-product-lead': {
    title: 'AI Product / ML Lead',
    summary: 'Decides what AI to build and how to measure it: evaluation, governance, experimentation and stakeholder alignment.',
    skills: [['Evaluation at scale', 'AIS-680'], ['AI governance', 'ETH-470'], ['Experimentation platforms', 'DAT-660'], ['Leading data teams', 'LDR-670']],
    tools: ['Evaluation tools', 'Experimentation platforms', 'Roadmapping'],
    programs: ['ms-aml', 'ms-ds'],
  },
  'mlops-engineer': {
    title: 'MLOps Engineer',
    summary: 'Owns the platform models run on: orchestration, deployment, monitoring and infrastructure as code.',
    skills: [['Data engineering pipelines', 'DEN-640'], ['Orchestration with Airflow', 'DEN-645'], ['Serving & monitoring models', 'OPS-440'], ['Infrastructure as code', 'OPS-455']],
    tools: ['Airflow', 'Docker', 'Kubernetes', 'Terraform', 'MLflow'],
    programs: ['c-mlops', 'bs-aiml'],
  },
};

// Ladders shown under "Where can this take you?".
export const TRACKS = {
  'data-to-ai': { title: 'From data into AI', steps: ['data-analyst', 'senior-data-analyst', 'ml-ai-specialist', 'ml-engineer'], last: 'AI Product / ML Engineer' },
  'data-science': { title: 'Data science and analytics', steps: ['data-analyst', 'senior-data-analyst', 'data-scientist', 'analytics-manager'] },
  'engineering-to-ai': { title: 'Software engineering into AI', steps: ['ai-engineer', 'ml-engineer', 'mlops-engineer', 'ai-product-lead'] },
};
