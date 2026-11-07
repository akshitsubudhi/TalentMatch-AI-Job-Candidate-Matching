import type { Explanation } from "../schemas";
import type { Explainer, ExplanationInput } from "./types";

export interface StoredExplanation extends Explanation {
  job_id: string;
  candidate_id: string;
  prompt_version: string;
  model: string;
  created_at?: string;
}

/** Persistence for match_explanations, keyed by (job_id, candidate_id, prompt_version). */
export interface ExplanationStore {
  get(jobId: string, candidateId: string, promptVersion: string): Promise<StoredExplanation | null>;
  /** Must be an upsert that keeps the first row on conflict (concurrent requests). */
  put(record: StoredExplanation): Promise<StoredExplanation>;
}

export interface ExplanationResult {
  explanation: StoredExplanation;
  cached: boolean;
}

export async function getOrCreateExplanation(args: {
  jobId: string;
  candidateId: string;
  store: ExplanationStore;
  explainer: Explainer;
  /** Only called on a cache miss. */
  loadInput: () => Promise<ExplanationInput>;
}): Promise<ExplanationResult> {
  const { jobId, candidateId, store, explainer } = args;
  const existing = await store.get(jobId, candidateId, explainer.promptVersion);
  if (existing) return { explanation: existing, cached: true };

  const input = await args.loadInput();
  const generated = await explainer.explain(input);
  const saved = await store.put({
    ...generated,
    job_id: jobId,
    candidate_id: candidateId,
    prompt_version: explainer.promptVersion,
    model: explainer.model,
  });
  return { explanation: saved, cached: false };
}
