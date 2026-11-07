import { SENIORITIES } from "../schemas";
import type { SeedDataset } from "./generate";

export interface LabelledQuery {
  jobIndex: number;
  /** Candidate indexes judged relevant from the generator's ground-truth skills. */
  relevantCandidateIndexes: number[];
}

export interface LabelOptions {
  /** Fraction of the job's required skills the candidate must truly have. */
  minSkillCoverage?: number;
  /** Max distance on the intern..principal ladder (default 1: e.g. a senior job accepts mid/senior/lead). */
  maxSeniorityGap?: number;
  /** Only keep jobs whose relevant set size is within [minRelevant, maxRelevant]. */
  minRelevant?: number;
  maxRelevant?: number;
  /** Size of the labelled set. */
  maxQueries?: number;
}

/**
 * Relevance is defined from the generator's GROUND TRUTH, not from the stored text:
 * a candidate is relevant to a job iff they are from the same role family, are within
 * maxSeniorityGap levels of the job's seniority, and truly have >= minSkillCoverage of
 * the job's required skills (whether the resume names those skills or only describes them).
 *
 * Jobs are taken in index order (deterministic) among those with a relevant-set size
 * in [minRelevant, maxRelevant], so Recall@10 is meaningful (not capped near 0 by
 * huge relevant sets).
 */
export function buildLabelledSet(dataset: SeedDataset, options: LabelOptions = {}): LabelledQuery[] {
  const minSkillCoverage = options.minSkillCoverage ?? 0.6;
  const minRelevant = options.minRelevant ?? 3;
  const maxRelevant = options.maxRelevant ?? 10;
  const maxQueries = options.maxQueries ?? 40;
  const maxSeniorityGap = options.maxSeniorityGap ?? 1;
  const level = (s: string) => SENIORITIES.indexOf(s as (typeof SENIORITIES)[number]);

  const out: LabelledQuery[] = [];
  for (const job of dataset.jobs) {
    const required = job.input.skills.map((s) => s.toLowerCase());
    const relevant = dataset.candidates
      .filter((c) => {
        if (c.family !== job.family) return false;
        if (Math.abs(level(c.fields.seniority) - level(job.input.seniority)) > maxSeniorityGap) return false;
        const have = new Set(c.trueSkills.map((s) => s.toLowerCase()));
        const covered = required.filter((s) => have.has(s)).length;
        return required.length > 0 && covered / required.length >= minSkillCoverage;
      })
      .map((c) => c.index);
    if (relevant.length >= minRelevant && relevant.length <= maxRelevant) {
      out.push({ jobIndex: job.index, relevantCandidateIndexes: relevant });
      if (out.length >= maxQueries) break;
    }
  }
  return out;
}
