import "server-only";
import { AppError, type MatchQuery } from "@talentmatch/core";
import type {
  CandidateDetail,
  CandidateMatch,
  CandidateSummary,
  JobDetail,
  JobMatch,
  JobSummary,
  SearchWeights,
} from "../types";
import { searchDefaults } from "./env";
import { supabaseAdmin } from "./supabase";

export const PAGE_SIZE = 24;

const JOB_COLUMNS = "id, title, location, seniority, skills, is_synthetic, created_at";
const CANDIDATE_COLUMNS = "id, full_name, headline, location, seniority, skills, is_synthetic, created_at";

function fail(context: string, error: { message: string; code?: string }): never {
  // PostgREST maps our RPC's `raise ... errcode P0002` to code "P0002".
  if (error.code === "P0002") throw new AppError(404, "not_found", error.message);
  if (error.code === "22023") throw new AppError(400, "validation_error", error.message);
  throw new AppError(502, "upstream_error", `${context}: ${error.message}`);
}

export interface ListFilters {
  page: number;
  location?: string | undefined;
  seniority?: string | undefined;
}

export async function listJobs(filters: ListFilters): Promise<{ rows: JobSummary[]; total: number }> {
  let query = supabaseAdmin().from("jobs").select(JOB_COLUMNS, { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (filters.location) query = query.eq("location", filters.location);
  if (filters.seniority) query = query.eq("seniority", filters.seniority);
  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) fail("listing jobs", error);
  return { rows: (data ?? []) as JobSummary[], total: count ?? 0 };
}

export async function listCandidates(filters: ListFilters): Promise<{ rows: CandidateSummary[]; total: number }> {
  let query = supabaseAdmin()
    .from("candidates")
    .select(CANDIDATE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id");
  if (filters.location) query = query.eq("location", filters.location);
  if (filters.seniority) query = query.eq("seniority", filters.seniority);
  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) fail("listing candidates", error);
  return { rows: (data ?? []) as CandidateSummary[], total: count ?? 0 };
}

export async function getJob(id: string): Promise<JobDetail | null> {
  const { data, error } = await supabaseAdmin().from("jobs").select(`${JOB_COLUMNS}, description`).eq("id", id).maybeSingle();
  if (error) fail("loading job", error);
  return (data as JobDetail | null) ?? null;
}

export async function getCandidate(id: string): Promise<CandidateDetail | null> {
  const { data, error } = await supabaseAdmin()
    .from("candidates")
    .select(`${CANDIDATE_COLUMNS}, resume_text, source_filename, source_mime`)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("loading candidate", error);
  return (data as CandidateDetail | null) ?? null;
}

/** Distinct locations for filter dropdowns (bounded scan; fine for demo-sized tables). */
export async function distinctLocations(table: "jobs" | "candidates"): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from(table).select("location").limit(5000);
  if (error) fail("loading locations", error);
  return [...new Set((data ?? []).map((r: { location: string }) => r.location))].sort();
}

export function resolveWeights(query: Pick<MatchQuery, "keywordWeight" | "semanticWeight" | "rrfK">): SearchWeights {
  const defaults = searchDefaults();
  const weights = {
    keywordWeight: query.keywordWeight ?? defaults.keywordWeight,
    semanticWeight: query.semanticWeight ?? defaults.semanticWeight,
    rrfK: query.rrfK ?? defaults.rrfK,
  };
  if (weights.keywordWeight === 0 && weights.semanticWeight === 0) {
    throw new AppError(400, "validation_error", "At least one of keywordWeight / semanticWeight must be > 0");
  }
  return weights;
}

function rpcArgs(query: MatchQuery, weights: SearchWeights) {
  return {
    p_match_count: query.limit,
    p_location: query.location ?? null,
    p_seniority: query.seniority ?? null,
    p_keyword_weight: weights.keywordWeight,
    p_semantic_weight: weights.semanticWeight,
    p_rrf_k: weights.rrfK,
    p_pool_size: Math.max(100, query.limit),
  };
}

export async function matchCandidatesForJob(jobId: string, query: MatchQuery, weights: SearchWeights): Promise<CandidateMatch[]> {
  const { data, error } = await supabaseAdmin().rpc("match_candidates_for_job", { p_job_id: jobId, ...rpcArgs(query, weights) });
  if (error) fail("matching candidates", error);
  return (data ?? []) as CandidateMatch[];
}

export async function matchJobsForCandidate(candidateId: string, query: MatchQuery, weights: SearchWeights): Promise<JobMatch[]> {
  const { data, error } = await supabaseAdmin().rpc("match_jobs_for_candidate", { p_candidate_id: candidateId, ...rpcArgs(query, weights) });
  if (error) fail("matching jobs", error);
  return (data ?? []) as JobMatch[];
}

/** A candidate's resume chunks in document order (used to build the LLM excerpt). */
export async function candidateChunks(candidateId: string): Promise<{ chunk_index: number; content: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("candidate_chunks")
    .select("chunk_index, content")
    .eq("candidate_id", candidateId)
    .order("chunk_index")
    .limit(20);
  if (error) fail("loading resume chunks", error);
  return data ?? [];
}

export async function counts(): Promise<{ jobs: number; candidates: number }> {
  const db = supabaseAdmin();
  const [jobs, candidates] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }),
    db.from("candidates").select("id", { count: "exact", head: true }),
  ]);
  if (jobs.error) fail("counting jobs", jobs.error);
  if (candidates.error) fail("counting candidates", candidates.error);
  return { jobs: jobs.count ?? 0, candidates: candidates.count ?? 0 };
}
