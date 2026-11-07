import { ExplanationSchema, type Explanation } from "../schemas";
import { extractSkills, normalizeSkill } from "../skills";
import type { Explainer, ExplanationInput } from "./types";

/**
 * Deterministic, no-LLM fallback (EXPLANATIONS_PROVIDER=rules). Used for offline
 * demos and tests. Clearly labelled "rule-based" in the UI; never presented as AI output.
 */
export class RuleBasedExplainer implements Explainer {
  readonly model = "rule-based";
  readonly promptVersion = "rules-v1";

  explain(input: ExplanationInput): Promise<Explanation> {
    const { job, candidate } = input;
    const candidateSkills = new Set(
      [...candidate.skills, ...extractSkills(candidate.resumeExcerpt)].map((s) => normalizeSkill(s).toLowerCase()),
    );
    const matched: string[] = [];
    const missing: string[] = [];
    for (const skill of job.skills) {
      const key = normalizeSkill(skill).toLowerCase();
      (candidateSkills.has(key) ? matched : missing).push(skill);
    }
    const coverage = job.skills.length === 0 ? 0 : Math.round((matched.length / job.skills.length) * 100);
    const first =
      matched.length > 0
        ? `The resume shows ${matched.length} of the ${job.skills.length} listed skills for this ${job.title} role (${coverage}%), including ${matched.slice(0, 3).join(", ")}.`
        : `The resume does not mention any of the ${job.skills.length} skills listed for this ${job.title} role.`;
    const second =
      candidate.seniority === job.seniority
        ? `Their ${candidate.seniority} seniority matches the role.`
        : `Their seniority (${candidate.seniority}) differs from the role's ${job.seniority} level.`;
    const third = missing.length > 0 ? `Gaps to probe: ${missing.slice(0, 3).join(", ")}.` : "";
    return Promise.resolve(
      ExplanationSchema.parse({
        summary: [first, second, third].filter(Boolean).join(" "),
        matched_skills: matched,
        missing_skills: missing,
      }),
    );
  }
}
