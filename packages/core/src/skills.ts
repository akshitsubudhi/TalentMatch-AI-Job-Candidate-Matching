/**
 * Canonical skill vocabulary with aliases. Used to:
 *  - normalise skills typed by recruiters/candidates ("postgres" -> "PostgreSQL"),
 *  - extract skills mentioned in resume text,
 *  - keep LLM "matched/missing skills" output inside the job's own skill list.
 */
export interface SkillDefinition {
  name: string;
  aliases: readonly string[];
}

export const SKILLS: readonly SkillDefinition[] = [
  // Languages
  { name: "JavaScript", aliases: ["JS", "ECMAScript"] },
  { name: "TypeScript", aliases: ["TS"] },
  { name: "Python", aliases: ["Python3"] },
  { name: "Java", aliases: [] },
  { name: "Kotlin", aliases: [] },
  { name: "Swift", aliases: [] },
  { name: "Go", aliases: ["Golang"] },
  { name: "Rust", aliases: [] },
  { name: "C#", aliases: ["CSharp", "C Sharp"] },
  { name: "C++", aliases: ["CPP"] },
  { name: "Ruby", aliases: [] },
  { name: "PHP", aliases: [] },
  { name: "Scala", aliases: [] },
  { name: "SQL", aliases: [] },
  { name: "R", aliases: [] },
  { name: "Bash", aliases: ["Shell scripting"] },
  // Frontend
  { name: "React", aliases: ["React.js", "ReactJS"] },
  { name: "Next.js", aliases: ["NextJS"] },
  { name: "Vue.js", aliases: ["Vue", "VueJS"] },
  { name: "Angular", aliases: [] },
  { name: "HTML", aliases: ["HTML5"] },
  { name: "CSS", aliases: ["CSS3"] },
  { name: "Tailwind CSS", aliases: ["Tailwind"] },
  { name: "Redux", aliases: [] },
  { name: "Accessibility", aliases: ["a11y", "WCAG"] },
  { name: "Webpack", aliases: ["Vite"] },
  // Backend
  { name: "Node.js", aliases: ["Node", "NodeJS"] },
  { name: "Express.js", aliases: ["Express"] },
  { name: "Django", aliases: [] },
  { name: "FastAPI", aliases: [] },
  { name: "Flask", aliases: [] },
  { name: "Spring Boot", aliases: ["Spring"] },
  { name: ".NET", aliases: ["dotnet", "ASP.NET"] },
  { name: "Ruby on Rails", aliases: ["Rails"] },
  { name: "GraphQL", aliases: [] },
  { name: "REST APIs", aliases: ["REST", "RESTful APIs"] },
  { name: "gRPC", aliases: [] },
  { name: "Microservices", aliases: [] },
  // Data stores
  { name: "PostgreSQL", aliases: ["Postgres", "psql"] },
  { name: "MySQL", aliases: [] },
  { name: "MongoDB", aliases: ["Mongo"] },
  { name: "Redis", aliases: [] },
  { name: "Elasticsearch", aliases: ["OpenSearch"] },
  { name: "Kafka", aliases: ["Apache Kafka"] },
  { name: "RabbitMQ", aliases: [] },
  { name: "DynamoDB", aliases: [] },
  { name: "Snowflake", aliases: [] },
  { name: "BigQuery", aliases: [] },
  // Cloud / infra
  { name: "AWS", aliases: ["Amazon Web Services"] },
  { name: "GCP", aliases: ["Google Cloud"] },
  { name: "Azure", aliases: [] },
  { name: "Docker", aliases: ["containers"] },
  { name: "Kubernetes", aliases: ["K8s"] },
  { name: "Terraform", aliases: [] },
  { name: "CI/CD", aliases: ["continuous integration", "GitHub Actions", "Jenkins"] },
  { name: "Linux", aliases: [] },
  { name: "Prometheus", aliases: ["Grafana"] },
  { name: "Observability", aliases: ["OpenTelemetry", "monitoring"] },
  { name: "Ansible", aliases: [] },
  // Data / ML
  { name: "Pandas", aliases: [] },
  { name: "NumPy", aliases: [] },
  { name: "scikit-learn", aliases: ["sklearn"] },
  { name: "PyTorch", aliases: [] },
  { name: "TensorFlow", aliases: ["Keras"] },
  { name: "Machine Learning", aliases: ["ML"] },
  { name: "Deep Learning", aliases: ["neural networks"] },
  { name: "NLP", aliases: ["natural language processing"] },
  { name: "LLMs", aliases: ["large language models", "GPT"] },
  { name: "MLOps", aliases: ["MLflow"] },
  { name: "Apache Spark", aliases: ["Spark", "PySpark"] },
  { name: "Airflow", aliases: ["Apache Airflow"] },
  { name: "dbt", aliases: [] },
  { name: "ETL", aliases: ["ELT", "data pipelines"] },
  { name: "Data Visualization", aliases: ["Tableau", "Power BI", "Looker"] },
  { name: "Statistics", aliases: ["A/B testing", "statistical analysis"] },
  { name: "Excel", aliases: ["spreadsheets"] },
  // Mobile
  { name: "iOS", aliases: [] },
  { name: "Android", aliases: [] },
  { name: "React Native", aliases: [] },
  { name: "Flutter", aliases: ["Dart"] },
  { name: "SwiftUI", aliases: [] },
  // Security
  { name: "Application Security", aliases: ["AppSec", "OWASP"] },
  { name: "Penetration Testing", aliases: ["pentesting", "pen testing"] },
  { name: "IAM", aliases: ["identity and access management"] },
  { name: "SIEM", aliases: ["Splunk"] },
  { name: "Threat Modeling", aliases: [] },
  { name: "Cryptography", aliases: [] },
  // QA
  { name: "Test Automation", aliases: ["automated testing"] },
  { name: "Selenium", aliases: [] },
  { name: "Cypress", aliases: ["Playwright"] },
  { name: "Jest", aliases: ["Vitest"] },
  { name: "Performance Testing", aliases: ["load testing", "JMeter", "k6"] },
  // Design / product
  { name: "Figma", aliases: [] },
  { name: "User Research", aliases: ["usability testing", "UX research"] },
  { name: "Prototyping", aliases: [] },
  { name: "Design Systems", aliases: [] },
  { name: "Product Strategy", aliases: ["product roadmap", "roadmapping"] },
  { name: "Agile", aliases: ["Scrum", "Kanban"] },
  { name: "Stakeholder Management", aliases: [] },
  { name: "Analytics", aliases: ["Amplitude", "Mixpanel", "product analytics"] },
  { name: "Jira", aliases: [] },
  // General
  { name: "Git", aliases: [] },
  { name: "System Design", aliases: ["distributed systems"] },
  { name: "Mentoring", aliases: ["coaching"] },
  { name: "Technical Leadership", aliases: ["tech lead"] },
];

const BY_LOWER = new Map<string, string>();
for (const skill of SKILLS) {
  BY_LOWER.set(skill.name.toLowerCase(), skill.name);
  for (const alias of skill.aliases) BY_LOWER.set(alias.toLowerCase(), skill.name);
}

/** Map a skill or alias to its canonical name; unknown skills are returned trimmed. */
export function normalizeSkill(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return BY_LOWER.get(trimmed.toLowerCase()) ?? trimmed;
}

/** Normalise and de-duplicate (case-insensitive), preserving first-seen order. */
export function normalizeSkills(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const skill = normalizeSkill(item);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Single-letter / very ambiguous names are only matched case-sensitively.
const CASE_SENSITIVE = new Set(["R", "Go", "ML", "TS", "JS", "Node", "Spring", "Express", "REST"]);

interface Matcher {
  canonical: string;
  re: RegExp;
}

const MATCHERS: Matcher[] = SKILLS.flatMap((skill) =>
  [skill.name, ...skill.aliases].map((term) => ({
    canonical: skill.name,
    // Custom boundaries so "C++", "C#", ".NET" and "Node.js" work.
    re: new RegExp(
      `(?<![A-Za-z0-9+#.])${escapeRegExp(term)}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`,
      CASE_SENSITIVE.has(term) ? "" : "i",
    ),
  })),
);

/** Canonical skills mentioned anywhere in `text` (by name or alias), in vocabulary order. */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const matcher of MATCHERS) {
    if (!found.has(matcher.canonical) && matcher.re.test(text)) found.add(matcher.canonical);
  }
  return SKILLS.map((s) => s.name).filter((name) => found.has(name));
}
