/**
 * Vocabulary for the SYNTHETIC demo dataset. Company names are invented; person
 * names are combinations of common given/family names and every generated
 * record is explicitly marked synthetic (is_synthetic = true + a header line).
 */
import type { Seniority } from "../schemas";

export interface RoleFamily {
  key: string;
  titles: readonly string[];
  headline: string;
  /** Skills a job in this family draws its requirements from (canonical names). */
  core: readonly string[];
  /** Occasional nice-to-haves. */
  optional: readonly string[];
  /** What people in this family do, used for summaries and job intros. */
  mission: readonly string[];
}

export const FAMILIES: readonly RoleFamily[] = [
  {
    key: "frontend",
    titles: ["Frontend Engineer", "UI Engineer", "Frontend Developer"],
    headline: "Frontend engineer",
    core: ["JavaScript", "TypeScript", "React", "Next.js", "CSS", "HTML", "Accessibility", "Redux", "Tailwind CSS", "Jest"],
    optional: ["GraphQL", "Webpack", "Figma", "Cypress", "Design Systems"],
    mission: ["fast, accessible web interfaces", "customer-facing web applications", "polished browser experiences"],
  },
  {
    key: "backend",
    titles: ["Backend Engineer", "Software Engineer, Backend", "API Engineer"],
    headline: "Backend engineer",
    core: ["Node.js", "TypeScript", "PostgreSQL", "REST APIs", "Redis", "Microservices", "Docker", "Kafka", "System Design", "Go"],
    optional: ["GraphQL", "gRPC", "AWS", "Kubernetes", "Observability"],
    mission: ["reliable APIs and services", "high-throughput backend systems", "the core platform services"],
  },
  {
    key: "fullstack",
    titles: ["Full-Stack Engineer", "Product Engineer", "Full-Stack Developer"],
    headline: "Full-stack engineer",
    core: ["TypeScript", "React", "Node.js", "PostgreSQL", "Next.js", "REST APIs", "CSS", "Docker", "Git", "GraphQL"],
    optional: ["AWS", "Redis", "Tailwind CSS", "Jest", "CI/CD"],
    mission: ["end-to-end product features", "web products from database to UI", "customer-facing product features"],
  },
  {
    key: "data-eng",
    titles: ["Data Engineer", "Analytics Engineer", "Data Platform Engineer"],
    headline: "Data engineer",
    core: ["Python", "SQL", "Apache Spark", "Airflow", "dbt", "Kafka", "Snowflake", "ETL", "AWS", "BigQuery"],
    optional: ["Scala", "Terraform", "Docker", "PostgreSQL", "Data Visualization"],
    mission: ["trustworthy data flows", "the company's data platform", "batch and streaming data infrastructure"],
  },
  {
    key: "ml",
    titles: ["Machine Learning Engineer", "ML Engineer", "Applied Scientist"],
    headline: "Machine learning engineer",
    core: ["Python", "PyTorch", "Machine Learning", "Deep Learning", "scikit-learn", "NumPy", "Pandas", "MLOps", "NLP", "LLMs"],
    optional: ["TensorFlow", "Apache Spark", "Kubernetes", "Docker", "Statistics"],
    mission: ["production prediction systems", "models that power search and recommendations", "model-powered features end to end"],
  },
  {
    key: "devops",
    titles: ["DevOps Engineer", "Site Reliability Engineer", "Platform Engineer"],
    headline: "Platform / SRE engineer",
    core: ["Kubernetes", "Docker", "Terraform", "AWS", "Linux", "CI/CD", "Prometheus", "Observability", "Bash", "Ansible"],
    optional: ["Go", "Python", "GCP", "Azure", "Kafka"],
    mission: ["reliable cloud infrastructure", "the internal developer platform", "uptime and deployment tooling"],
  },
  {
    key: "mobile",
    titles: ["Mobile Engineer", "iOS Engineer", "Android Engineer"],
    headline: "Mobile engineer",
    core: ["Swift", "SwiftUI", "iOS", "Kotlin", "Android", "React Native", "Flutter", "REST APIs", "Git", "Accessibility"],
    optional: ["TypeScript", "GraphQL", "CI/CD", "Figma", "Jest"],
    mission: ["native mobile apps", "the company's phone apps", "mobile experiences used daily by customers"],
  },
  {
    key: "security",
    titles: ["Security Engineer", "Application Security Engineer", "Cloud Security Engineer"],
    headline: "Security engineer",
    core: ["Application Security", "Penetration Testing", "Threat Modeling", "IAM", "SIEM", "Cryptography", "AWS", "Linux", "Python", "Kubernetes"],
    optional: ["Go", "Terraform", "Docker", "CI/CD", "Bash"],
    mission: ["the security of our products", "secure-by-default engineering practices", "detection and response"],
  },
  {
    key: "qa",
    titles: ["QA Automation Engineer", "Software Engineer in Test", "Quality Engineer"],
    headline: "QA automation engineer",
    core: ["Test Automation", "Selenium", "Cypress", "Jest", "Performance Testing", "JavaScript", "Python", "CI/CD", "REST APIs", "SQL"],
    optional: ["TypeScript", "Docker", "Java", "Agile", "Jira"],
    mission: ["product quality at speed", "automated test infrastructure", "release confidence"],
  },
  {
    key: "design",
    titles: ["Product Designer", "UX Designer", "Senior Interaction Designer"],
    headline: "Product designer",
    core: ["Figma", "User Research", "Prototyping", "Design Systems", "Accessibility", "HTML", "CSS", "Analytics", "Agile", "Stakeholder Management"],
    optional: ["React", "Data Visualization", "Jira", "Product Strategy"],
    mission: ["intuitive product experiences", "the end-to-end user journey", "a consistent design language"],
  },
  {
    key: "analyst",
    titles: ["Data Analyst", "Business Intelligence Analyst", "Product Analyst"],
    headline: "Data analyst",
    core: ["SQL", "Python", "Data Visualization", "Statistics", "Excel", "Pandas", "Analytics", "BigQuery", "Snowflake", "Stakeholder Management"],
    optional: ["dbt", "R", "Airflow", "Machine Learning"],
    mission: ["decision-ready insights", "metrics the business trusts", "self-serve reporting"],
  },
  {
    key: "pm",
    titles: ["Product Manager", "Technical Product Manager", "Group Product Manager"],
    headline: "Product manager",
    core: ["Product Strategy", "Agile", "Stakeholder Management", "Analytics", "User Research", "Jira", "SQL", "Statistics", "Prototyping", "Technical Leadership"],
    optional: ["Figma", "Data Visualization", "Machine Learning", "REST APIs"],
    mission: ["products customers love", "the product direction", "outcomes for a cross-functional team"],
  },
];

/**
 * Descriptions of a skill that deliberately avoid its name and aliases, so keyword
 * search cannot find them but a semantic model might. (A unit test enforces that
 * extractSkills() finds nothing in these phrases.)
 */
export const IMPLIED: Readonly<Record<string, string>> = {
  JavaScript: "wrote interactive browser scripting for dynamic pages",
  TypeScript: "added static typing to a large web codebase",
  Python: "wrote automation and data tooling in a popular dynamic scripting language",
  Java: "maintained JVM services for enterprise customers",
  Kotlin: "built modern JVM code for Google's mobile platform",
  Swift: "wrote native code for Apple devices",
  Go: "built concurrent network daemons in a compiled language from Google",
  SQL: "wrote complex relational queries with window functions",
  Bash: "automated server chores with terminal scripts",
  Scala: "wrote functional JVM code for distributed jobs",
  R: "ran statistical modelling in a language built for statisticians",
  React: "built component-based single-page user interfaces with hooks",
  "Next.js": "shipped server-rendered web pages with file-based routing",
  CSS: "crafted responsive layouts with flexbox and grid",
  HTML: "wrote semantic page markup",
  "Tailwind CSS": "styled pages with utility-first class names",
  Redux: "managed client-side state with a predictable store",
  Accessibility: "made pages usable with screen readers and keyboard-only navigation",
  Webpack: "tuned front-end bundling and code splitting",
  "Node.js": "ran server-side code on the V8 runtime",
  "REST APIs": "designed resource-oriented HTTP endpoints with versioning",
  GraphQL: "designed a typed query schema for client data fetching",
  gRPC: "defined protobuf contracts for service-to-service calls",
  Microservices: "split a monolith into small independently deployed services",
  PostgreSQL: "tuned indexes and query plans on an open-source relational database",
  Redis: "added an in-memory key-value cache in front of the database",
  Kafka: "built event streaming with partitioned commit logs",
  Snowflake: "modelled tables in a cloud data warehouse with separate storage and compute",
  BigQuery: "queried petabyte-scale tables in Google's serverless warehouse",
  AWS: "deployed workloads to Amazon's cloud using EC2, S3 and Lambda",
  GCP: "ran workloads on Google's public cloud",
  Azure: "ran workloads on Microsoft's public cloud",
  Docker: "packaged applications into portable images",
  Kubernetes: "orchestrated containerised workloads across clusters with pods and Helm charts",
  Terraform: "codified cloud infrastructure as declarative configuration",
  "CI/CD": "automated build, test and deploy pipelines on every merge",
  Linux: "administered Unix-like servers and kernels",
  Prometheus: "scraped time-series metrics and wrote alerting rules",
  Observability: "instrumented services with traces, metrics and structured logs",
  Ansible: "configured fleets of servers with agentless playbooks",
  "Apache Spark": "processed large datasets with distributed in-memory dataframes",
  Airflow: "scheduled data workflows as directed acyclic graphs",
  dbt: "built version-controlled warehouse transformation models with tests",
  ETL: "moved and transformed data between operational and analytical stores",
  PyTorch: "trained models with dynamic computation graphs and autograd",
  TensorFlow: "trained models with Google's graph-based framework",
  "Machine Learning": "trained predictive models on historical data",
  "Deep Learning": "trained multi-layer models on images and text",
  NLP: "built text classification and entity extraction",
  LLMs: "built retrieval-augmented generation features on top of foundation models",
  MLOps: "versioned models and automated retraining and deployment",
  "scikit-learn": "built classic classifiers and regressors with a standard estimator API",
  NumPy: "vectorised numerical computations on n-dimensional arrays",
  Pandas: "cleaned tabular data with dataframes",
  "Data Visualization": "built dashboards and charts for executives",
  Statistics: "designed controlled experiments and significance tests",
  Excel: "built financial models in workbooks with pivot tables",
  iOS: "shipped apps to the App Store",
  Android: "shipped apps to the Play Store",
  SwiftUI: "built declarative user interfaces for iPhone",
  "React Native": "built cross-platform phone apps from one web-style component codebase",
  Flutter: "built cross-platform mobile apps from a single widget codebase",
  "Application Security": "fixed injection and cross-site scripting vulnerabilities in web apps",
  "Penetration Testing": "ran authorised attack simulations against production systems",
  "Threat Modeling": "mapped attack surfaces and abuse cases before launch",
  IAM: "designed least-privilege roles, permissions and single sign-on",
  SIEM: "correlated security logs to detect intrusions",
  Cryptography: "implemented key management, hashing and encryption at rest",
  "Test Automation": "replaced manual regression checks with scripted suites",
  Selenium: "drove real browsers with WebDriver scripts",
  Cypress: "wrote end-to-end browser tests that run in CI",
  Jest: "wrote fast unit tests with snapshots and mocks",
  "Performance Testing": "simulated peak traffic to find throughput limits",
  Figma: "designed screens in a collaborative browser-based design tool",
  "User Research": "interviewed customers and ran usability sessions",
  Prototyping: "built clickable mock-ups to validate ideas early",
  "Design Systems": "maintained a shared library of reusable UI components and tokens",
  "Product Strategy": "defined the vision and multi-quarter plan for a product area",
  Agile: "ran two-week sprints with retrospectives",
  "Stakeholder Management": "aligned executives, sales and engineering on priorities",
  Analytics: "instrumented product funnels and retention cohorts",
  Jira: "triaged backlogs in an issue tracker",
  Git: "managed branching and code review workflows",
  "System Design": "designed scalable architectures with caching, queues and sharding",
  "Technical Leadership": "set technical direction for a team of engineers",
  Mentoring: "coached junior colleagues through regular one-on-ones",
};

export const OUTCOMES: readonly string[] = [
  "cutting p95 latency by 40%",
  "reducing infrastructure cost by 25%",
  "supporting 3x traffic growth",
  "improving conversion by 8%",
  "halving on-call pages",
  "shortening release cycles from weeks to days",
  "unblocking a new enterprise segment",
  "raising test coverage to 85%",
  "serving 2M monthly users",
  "eliminating a class of production incidents",
];

export const LOCATIONS: readonly string[] = [
  "Remote",
  "Berlin, Germany",
  "London, UK",
  "Amsterdam, Netherlands",
  "New York, USA",
  "San Francisco, USA",
  "Toronto, Canada",
  "Bangalore, India",
  "Singapore",
  "Austin, USA",
];

export const SENIORITY_YEARS: Readonly<Record<Seniority, [number, number]>> = {
  intern: [0, 1],
  junior: [1, 2],
  mid: [3, 5],
  senior: [5, 9],
  lead: [8, 12],
  principal: [11, 18],
};

export const SENIORITY_TITLE: Readonly<Record<Seniority, string>> = {
  intern: "Intern",
  junior: "Junior",
  mid: "",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
};

export const COMPANY_PREFIXES = ["Northwind", "Bluefin", "Quarry", "Lumen", "Copperleaf", "Halcyon", "Brightline", "Orchard", "Tidewater", "Granite", "Juniper", "Meridian"];
export const COMPANY_SUFFIXES = ["Labs", "Systems", "Health", "Logistics", "Analytics", "Pay", "Robotics", "Studio", "Cloud", "Energy"];

export const FIRST_NAMES = ["Alex", "Priya", "Jordan", "Mei", "Samuel", "Fatima", "Lukas", "Aisha", "Diego", "Hana", "Noah", "Zara", "Tomás", "Ingrid", "Kwame", "Sofia", "Ravi", "Elena", "Omar", "Yuki", "Chloe", "Mateo", "Leila", "Jonas", "Amara", "Ethan", "Nadia", "Felix", "Grace", "Arjun"];
export const LAST_NAMES = ["Novak", "Okafor", "Silva", "Chen", "Müller", "Haddad", "Kowalski", "Tanaka", "Reyes", "Andersen", "Patel", "Dubois", "Mensah", "Rossi", "Ivanova", "Kim", "Larsen", "Nakamura", "Costa", "Brennan", "Sato", "Varga", "Lindqvist", "Adeyemi", "Moreau", "Schmidt", "Ortega", "Byrne", "Jovanović", "Rahman"];

export const DEGREES = [
  "BSc Computer Science",
  "BEng Software Engineering",
  "MSc Data Science",
  "BA Interaction Design",
  "BSc Mathematics",
  "MSc Artificial Intelligence",
  "BSc Information Systems",
  "Self-taught; completed an intensive bootcamp",
];

/**
 * Alternative spellings of the *same* skill that resumes sometimes use. (Unlike the
 * vocabulary's aliases, this excludes different tools such as "Grafana" for Prometheus.)
 */
export const SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  PostgreSQL: ["Postgres"],
  Kubernetes: ["K8s"],
  JavaScript: ["JS"],
  "Node.js": ["NodeJS"],
  React: ["React.js", "ReactJS"],
  Go: ["Golang"],
  "Machine Learning": ["ML"],
  AWS: ["Amazon Web Services"],
  "Apache Spark": ["Spark", "PySpark"],
  Airflow: ["Apache Airflow"],
  Kafka: ["Apache Kafka"],
  "scikit-learn": ["sklearn"],
  "REST APIs": ["RESTful APIs"],
  NLP: ["natural language processing"],
  LLMs: ["large language models"],
  "Penetration Testing": ["pentesting"],
  "Application Security": ["AppSec"],
  IAM: ["identity and access management"],
  "Test Automation": ["automated testing"],
  "User Research": ["UX research"],
  "Next.js": ["NextJS"],
  "Tailwind CSS": ["Tailwind"],
  "CI/CD": ["continuous integration"],
};
