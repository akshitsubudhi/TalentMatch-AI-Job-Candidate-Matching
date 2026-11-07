import type { Explanation } from "../schemas";

export interface ExplanationJobContext {
  title: string;
  description: string;
  location: string;
  seniority: string;
  skills: readonly string[];
}

/** Deliberately excludes the candidate's name: the LLM does not need PII. */
export interface ExplanationCandidateContext {
  headline: string;
  location: string;
  seniority: string;
  skills: readonly string[];
  /** Most relevant resume text (already truncated by the caller). */
  resumeExcerpt: string;
}

export interface ExplanationInput {
  job: ExplanationJobContext;
  candidate: ExplanationCandidateContext;
}

export interface Explainer {
  readonly model: string;
  readonly promptVersion: string;
  explain(input: ExplanationInput): Promise<Explanation>;
}

export class ExplanationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExplanationError";
  }
}
