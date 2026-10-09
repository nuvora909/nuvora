// Industry certifications whose official exam topics overlap a Nuvora program's curriculum. Text only: no logos,
// no endorsements. Nuvora is not affiliated with these companies and does not prepare students for, include or
// pay for their exams; pages say "Topics overlap with", never "prepares you for".
//
// Every entry was checked on the vendor's own page on CHECKED: the exact name, that it is offered today, and its
// official exam areas. Re-check before relying on a name or status: vendors rename, update and retire exams.
// An exam is listed for a program only when its official areas clearly overlap lessons that program teaches
// (lesson codes from scripts/catalog.mjs; tests/site/showcase.test.mjs checks each code is in that program).
export const CHECKED = '2026-10-03';

export const CERT_DISCLAIMER = 'Nuvora isnâ€™t affiliated with these companies. Their exams are booked and paid for with them directly, and Nuvora doesnâ€™t issue their certificates.';

// name: exactly as the vendor writes it. status: anything a learner should know before booking (null when the
// exam is simply available). areas: the vendor's official exam areas, word for word as published, except where
// summarised is true: the AWS page does not list its domain titles (the exam guide's differ slightly between
// MLA-C01 and MLA-C02), so those are summarised and the pages say so.
export const CERTS = {
  'gcp-pmle': {
    vendor: 'Google Cloud', name: 'Professional Machine Learning Engineer',
    url: 'https://cloud.google.com/learn/certification/machine-learning-engineer', checked: CHECKED,
    status: 'Google Cloud has updated this exam for the move from Vertex AI to Gemini Enterprise Agent Platform. Check the current exam guide for the products it covers.',
    areas: ['Architect low-code AI solutions', 'Collaborate within and across teams to manage data and models', 'Scale prototypes into ML models', 'Serve and scale models', 'Automate and orchestrate ML pipelines', 'Monitor AI solutions'],
  },
  'gcp-pde': {
    vendor: 'Google Cloud', name: 'Professional Data Engineer',
    url: 'https://cloud.google.com/learn/certification/data-engineer', checked: CHECKED,
    status: 'Google Cloud says this exam will soon be updated for recent product name changes. Check the current exam guide before booking.',
    areas: ['Design data processing systems', 'Ingest and process the data', 'Store the data', 'Prepare and use data for analysis', 'Maintain and automate data workloads'],
  },
  'aws-mla': {
    vendor: 'Amazon Web Services', name: 'AWS Certified Machine Learning Engineer â€“ Associate',
    url: 'https://aws.amazon.com/certification/certified-machine-learning-engineer-associate/', checked: CHECKED,
    status: 'AWS is updating this exam: the new version (MLA-C02) has been in beta in English since 29 September 2026.',
    areas: ['Data preparation for machine learning', 'ML model development', 'Deployment and orchestration of ML workflows', 'ML solution monitoring, maintenance and security'], summarised: true,
  },
  'ms-ai300': {
    vendor: 'Microsoft', name: 'Microsoft Certified: Machine Learning Operations Engineer Associate', exam: 'AI-300',
    url: 'https://learn.microsoft.com/en-us/credentials/certifications/operationalizing-machine-learning-and-generative-ai-solutions/', checked: CHECKED, status: null,
    areas: ['Design and implement an MLOps infrastructure', 'Implement machine learning model lifecycle and operations', 'Design and implement a GenAIOps infrastructure', 'Implement generative AI quality assurance and observability', 'Optimize generative AI systems and model performance'],
  },
  'ms-ai103': {
    vendor: 'Microsoft', name: 'Microsoft Certified: Azure AI Apps and Agents Developer Associate', exam: 'AI-103',
    url: 'https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-apps-and-agents-developer-associate/', checked: CHECKED, status: null,
    areas: ['Plan and manage an Azure AI solution', 'Implement generative AI and agentic solutions', 'Implement computer vision solutions', 'Implement text analysis solutions', 'Implement information extraction solutions'],
  },
  'dbx-genai': {
    vendor: 'Databricks', name: 'Databricks Certified Generative AI Engineer Associate',
    url: 'https://www.databricks.com/learn/certification/genai-engineer-associate', checked: CHECKED, status: null,
    areas: ['Design Applications', 'Data Preparation', 'Application Development', 'Assembling and Deploying Apps', 'Governance', 'Evaluation and Monitoring'],
  },
  'dbx-de': {
    vendor: 'Databricks', name: 'Databricks Certified Data Engineer Associate',
    url: 'https://www.databricks.com/learn/certification/data-engineer-associate', checked: CHECKED, status: null,
    areas: ['Databricks Intelligence Platform', 'Data Ingestion and Loading', 'Data Transformation and Modeling', 'Working with Lakeflow Jobs', 'Implementing CI/CD', 'Troubleshooting, Monitoring, and Optimization', 'Governance and Security'],
  },
  'dbx-mlp': {
    vendor: 'Databricks', name: 'Databricks Certified Machine Learning Professional',
    url: 'https://www.databricks.com/learn/certification/machine-learning-professional', checked: CHECKED, status: null,
    areas: ['Model Development', 'ML Ops', 'Model Deployment'],
  },
  'dbx-da': {
    vendor: 'Databricks', name: 'Databricks Certified Data Analyst Associate',
    url: 'https://www.databricks.com/learn/certification/data-analyst-associate', checked: CHECKED, status: null,
    areas: ['Understanding of Databricks Data + AI Platform', 'Managing Data', 'Importing Data', 'Executing queries using Databricks SQL and Databricks SQL Warehouses', 'Analyzing Queries', 'Creating Dashboards and Visualizations in Databricks', 'Developing, Sharing, and Maintaining AI/BI Genie spaces', 'Data Modeling with Databricks SQL', 'Securing Data'],
  },
  'nv-genl': {
    vendor: 'NVIDIA', name: 'NVIDIA-Certified Associate Generative AI LLMs', exam: 'NCA-GENL',
    url: 'https://www.nvidia.com/en-us/learn/certification/generative-ai-llm-associate/', checked: CHECKED, status: null,
    areas: ['Core Machine Learning and AI Knowledge', 'Data Analysis', 'Experimentation', 'Software Development', 'Trustworthy AI'],
  },
  'pi-pcep': {
    vendor: 'Python Institute', name: 'PCEPâ„¢ â€“ Certified Entry-Level Python Programmer',
    url: 'https://pythoninstitute.org/pcep', checked: CHECKED, status: null,
    areas: ['Computer Programming and Python Fundamentals', 'Control Flow â€“ Conditional Blocks and Loops', 'Data Collections â€“ Tuples, Dictionaries, Lists, and Strings', 'Functions and Exceptions'],
  },
  'pi-pced': {
    vendor: 'Python Institute', name: 'PCEDâ„¢ â€“ Certified Entry-Level Data Analyst with Python',
    url: 'https://pythoninstitute.org/pced', checked: CHECKED, status: null,
    areas: ['Introduction to Data and Data Analysis Concepts', 'Python Basics for Data Analysis', 'Working with Data and Performing Simple Analyses', 'Communicating Insights and Reporting'],
  },
  'sf-tableau': {
    vendor: 'Salesforce (Tableau)', name: 'Salesforce Certified Tableau Data Analyst',
    url: 'https://trailhead.salesforce.com/credentials/tableaudataanalyst', checked: CHECKED, status: null,
    areas: ['Connect to and Transform Data', 'Explore and Analyze Data', 'Create Content', 'Publish and Manage Content on Tableau Server and Tableau Cloud'],
  },
};

// Per program: which certifications, the official exam areas that overlap, and the Nuvora lessons they overlap
// with. Order is the order shown.
export const PROGRAM_CERTS = {
  'bs-ds': [
    { cert: 'sf-tableau', areas: ['Explore and Analyze Data', 'Create Content'], lessons: ['DAT-210', 'VIS-220', 'VIS-240'] },
    { cert: 'dbx-da', areas: ['Executing queries using Databricks SQL and Databricks SQL Warehouses', 'Creating Dashboards and Visualizations in Databricks'], lessons: ['DBS-130', 'DBS-140', 'DBS-150', 'VIS-240'] },
    { cert: 'gcp-pde', areas: ['Ingest and process the data', 'Store the data', 'Maintain and automate data workloads'], lessons: ['DEN-310', 'DEN-320', 'DEN-330', 'DEN-340'] },
  ],
  'bs-aiml': [
    { cert: 'aws-mla', areas: ['Data preparation for machine learning', 'ML model development', 'ML solution monitoring, maintenance and security'], lessons: ['DAT-220', 'ML-230', 'ML-240', 'OPS-440', 'OPS-445'] },
    { cert: 'gcp-pmle', areas: ['Serve and scale models', 'Automate and orchestrate ML pipelines', 'Monitor AI solutions'], lessons: ['OPS-440', 'OPS-445', 'OPS-450'] },
    { cert: 'nv-genl', areas: ['Core Machine Learning and AI Knowledge', 'Experimentation', 'Software Development'], lessons: ['DL-330', 'DL-340', 'AIS-410', 'AIS-420'] },
  ],
  'ms-aml': [
    { cert: 'gcp-pmle', areas: ['Scale prototypes into ML models', 'Automate and orchestrate ML pipelines', 'Monitor AI solutions'], lessons: ['OPS-640', 'OPS-650', 'AIS-660'] },
    { cert: 'ms-ai300', areas: ['Implement machine learning model lifecycle and operations', 'Implement generative AI quality assurance and observability'], lessons: ['OPS-650', 'AIS-660', 'AIS-680'] },
    { cert: 'dbx-mlp', areas: ['Model Development', 'ML Ops'], lessons: ['DL-620', 'OPS-650', 'OPS-665'] },
  ],
  'ms-ds': [
    { cert: 'gcp-pde', areas: ['Design data processing systems', 'Ingest and process the data', 'Store the data'], lessons: ['DEN-640', 'DEN-650', 'DEN-655', 'DEN-660'] },
    { cert: 'dbx-de', areas: ['Data Ingestion and Loading', 'Data Transformation and Modeling', 'Governance and Security'], lessons: ['DEN-640', 'DEN-650', 'ETH-680'] },
  ],
  'c-py': [
    { cert: 'pi-pcep', areas: ['Computer Programming and Python Fundamentals', 'Control Flow â€“ Conditional Blocks and Loops', 'Data Collections â€“ Tuples, Dictionaries, Lists, and Strings', 'Functions and Exceptions'], lessons: ['PRG-101'] },
    { cert: 'pi-pced', areas: ['Python Basics for Data Analysis', 'Working with Data and Performing Simple Analyses', 'Communicating Insights and Reporting'], lessons: ['PRG-101', 'DAT-210', 'VIS-220'] },
  ],
  'c-genai': [
    { cert: 'dbx-genai', areas: ['Design Applications', 'Application Development', 'Evaluation and Monitoring'], lessons: ['AIS-410', 'AIS-420', 'AIS-425', 'AIS-430'] },
    { cert: 'ms-ai103', areas: ['Implement generative AI and agentic solutions'], lessons: ['AIS-410', 'AIS-420', 'AIS-425'] },
    { cert: 'nv-genl', areas: ['Core Machine Learning and AI Knowledge', 'Software Development'], lessons: ['AIS-410', 'AIS-420', 'AIS-430'] },
  ],
  'c-mlops': [
    { cert: 'ms-ai300', areas: ['Design and implement an MLOps infrastructure', 'Implement machine learning model lifecycle and operations'], lessons: ['OPS-440', 'OPS-650'] },
    { cert: 'gcp-pmle', areas: ['Serve and scale models', 'Automate and orchestrate ML pipelines', 'Monitor AI solutions'], lessons: ['DEN-645', 'OPS-440', 'OPS-650'] },
    { cert: 'dbx-de', areas: ['Data Ingestion and Loading', 'Working with Lakeflow Jobs'], lessons: ['DEN-640', 'DEN-645'] },
  ],
};

/** The certifications for one program, joined with their details. */
export const certsFor = (programId) => (PROGRAM_CERTS[programId] ?? []).map((m) => ({ ...CERTS[m.cert], id: m.cert, overlapAreas: m.areas, lessons: m.lessons }));
