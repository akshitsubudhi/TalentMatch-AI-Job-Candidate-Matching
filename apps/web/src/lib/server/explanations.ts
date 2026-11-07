import "server-only";
import { AppError, MatchQuerySchema } from "@talentmatch/core";
import {
  createExplainer,
  getOrCreateExplanation,
  MAX_RESUME_EXCERPT_CHARS,
  type Explainer,
  type ExplanationResult,
  type ExplanationStore,
  type StoredExplanation,
} from "@talentmatch/core/explain";
import { candidateChunks, getCandidate, getJob, matchCandidatesForJob, matchJobsForCandidate, resolveWeights } from "./data";
import { serverEnv } from "./env";
import { supabaseAdmin } from "./supabase";

const COLUMNS = "job_id, candidate_id, prompt_version, model, summary, matched_skills, missing_skills, created_at";

export const supabaseExplanationStore: ExplanationStore = {
  async get(jobId, candidateId, promptVersion) {
    const { data, error } = await supabaseAdmin()
      .from("match_explanations")
      .select(COLUMNS)
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .eq("prompt_version", promptVersion)
      .maybeSingle();
    if (error) throw new AppError(502, "upstream_error", `reading explanation cache: ${error.message}`);
    return (data as StoredExplanation | null) ?? null;
  },
  async put(record) {
    // ignoreDuplicates keeps the first row if two requests race on the same key.
    const { error } = await supabaseAdmin()
      .from("match_explanations")
      .upsert(
        {
          job_id: record.job_id,
          candidate_id: record.candidate_id,
          prompt_version: record.prompt_version,
          model: record.model,
          summary: record.summary,
          matched_skills: record.matched_skills,
          missing_skills: record.missing_skills,
        },
        { onConflict: "job_id,candidate_id,prompt_version", ignoreDuplicates: true },
      );
    if (error) throw new AppError(502, "upstream_error", `writing explanation cache: ${error.message}`);
    const stored = await this.get(record.job_id, record.candidate_id, record.prompt_version);
    return stored ?? record;
  },
};

let explainer: Explainer | undefined;
function getExplainer(): Explainer {
  explainer ??= createExplainer(serverEnv());
  return explainer;
}

/**
 * Cost guard: only pairs that appear in the top-N matches (either direction) may
 * trigger a new LLM call, so the endpoint cannot be used to explain arbitrary pairs.
 */
async function assertTopMatch(jobId: string, candidateId: string): Promise<void> {
  const topN = serverEnv().EXPLAIN_TOP_N;
  if (topN === 0) throw new AppError(404, "not_found", "Explanations are disabled (EXPLAIN_TOP_N=0)");
  const query = MatchQuerySchema.parse({ limit: topN });
  const weights = resolveWeights({});
  const forJob = await matchCandidatesForJob(jobId, query, weights);
  if (forJob.some((m) => m.candidate_id === candidateId)) return;
  const forCandidate = await matchJobsForCandidate(candidateId, query, weights);
  if (forCandidate.some((m) => m.job_id === jobId)) return;
  throw new AppError(404, "not_found", `Explanations are only generated for top-${topN} matches`);
}

export async function explainMatch(jobId: string, candidateId: string): Promise<ExplanationResult> {
  const active = getExplainer();
  return getOrCreateExplanation({
    jobId,
    candidateId,
    store: supabaseExplanationStore,
    explainer: active,
    loadInput: async () => {
      const [job, candidate] = await Promise.all([getJob(jobId), getCandidate(candidateId)]);
      if (!job) throw new AppError(404, "not_found", "Job not found");
      if (!candidate) throw new AppError(404, "not_found", "Candidate not found");
      await assertTopMatch(jobId, candidateId);
      const chunks = await candidateChunks(candidateId);
      const excerpt = chunks.map((c) => c.content).join("\n").slice(0, MAX_RESUME_EXCERPT_CHARS);
      return {
        job: { title: job.title, description: job.description, location: job.location, seniority: job.seniority, skills: job.skills },
        candidate: {
          headline: candidate.headline,
          location: candidate.location,
          seniority: candidate.seniority,
          skills: candidate.skills,
          resumeExcerpt: excerpt || candidate.resume_text.slice(0, MAX_RESUME_EXCERPT_CHARS),
        },
      };
    },
  });
}
