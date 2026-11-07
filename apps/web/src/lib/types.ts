// Shapes shared by server components and client components (no secrets here).
export interface JobSummary {
  id: string;
  title: string;
  location: string;
  seniority: string;
  skills: string[];
  is_synthetic: boolean;
  created_at: string;
}

export interface JobDetail extends JobSummary {
  description: string;
}

export interface CandidateSummary {
  id: string;
  full_name: string;
  headline: string;
  location: string;
  seniority: string;
  skills: string[];
  is_synthetic: boolean;
  created_at: string;
}

export interface CandidateDetail extends CandidateSummary {
  resume_text: string;
  source_filename: string | null;
  source_mime: string;
}

interface MatchScores {
  keyword_rank: number | null;
  semantic_rank: number | null;
  keyword_score: number | null;
  semantic_similarity: number | null;
  rrf_score: number;
}

export interface CandidateMatch extends MatchScores {
  candidate_id: string;
  full_name: string;
  headline: string;
  location: string;
  seniority: string;
  skills: string[];
  is_synthetic: boolean;
}

export interface JobMatch extends MatchScores {
  job_id: string;
  title: string;
  location: string;
  seniority: string;
  skills: string[];
  is_synthetic: boolean;
}

export interface ExplanationResponse {
  data: {
    summary: string;
    matched_skills: string[];
    missing_skills: string[];
    model: string;
    prompt_version: string;
    cached: boolean;
  };
}

export interface SearchWeights {
  keywordWeight: number;
  semanticWeight: number;
  rrfK: number;
}
