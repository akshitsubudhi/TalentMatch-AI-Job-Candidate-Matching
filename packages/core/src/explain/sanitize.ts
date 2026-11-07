import type { Explanation } from "../schemas";
import { normalizeSkill } from "../skills";

/**
 * Guard against hallucinated skills: keep only items that map (after alias
 * normalisation) to a skill on the job's own list, use the job's spelling, and
 * never list a skill as both matched and missing.
 */
export function constrainSkillsToJob(explanation: Explanation, jobSkills: readonly string[]): Explanation {
  const byKey = new Map(jobSkills.map((s) => [normalizeSkill(s).toLowerCase(), s]));
  const pick = (items: readonly string[]) => {
    const out: string[] = [];
    for (const item of items) {
      const match = byKey.get(normalizeSkill(item).toLowerCase());
      if (match !== undefined && !out.includes(match)) out.push(match);
    }
    return out;
  };
  const matched = pick(explanation.matched_skills);
  const missing = pick(explanation.missing_skills).filter((s) => !matched.includes(s));
  return { summary: explanation.summary, matched_skills: matched, missing_skills: missing };
}
