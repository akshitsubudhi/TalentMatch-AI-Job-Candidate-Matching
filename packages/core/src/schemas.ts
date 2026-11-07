import { z } from "zod";
import { normalizeSkills } from "./skills";

export const SENIORITIES = ["intern", "junior", "mid", "senior", "lead", "principal"] as const;
export const SenioritySchema = z.enum(SENIORITIES);
export type Seniority = z.infer<typeof SenioritySchema>;

const SkillSchema = z.string().trim().min(1).max(60);

/** Accepts ["a","b"] or "a, b" (form fields) and returns normalised, de-duplicated skills. */
export const SkillListSchema = z
  .union([z.array(SkillSchema).max(100), z.string().max(2000)])
  .transform((value) => (Array.isArray(value) ? value : value.split(/[,\n;]/)))
  .transform((items) => normalizeSkills(items.map((s) => s.trim()).filter(Boolean)))
  .pipe(z.array(SkillSchema).max(50));

export const JobCreateInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(20).max(20_000),
  location: z.string().trim().min(2).max(120),
  seniority: SenioritySchema,
  skills: SkillListSchema.default([]),
});
export type JobCreateInput = z.infer<typeof JobCreateInputSchema>;

/** Non-file fields of the multipart resume upload. */
export const CandidateUploadFieldsSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  location: z.string().trim().min(2).max(120),
  seniority: SenioritySchema,
  headline: z.string().trim().max(300).default(""),
  skills: SkillListSchema.default([]),
});
export type CandidateUploadFields = z.infer<typeof CandidateUploadFieldsSchema>;

export const UuidSchema = z.uuid();

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

/** Query-string parameters for both match directions. */
export const MatchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  location: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(120).optional()),
  seniority: z.preprocess(emptyToUndefined, SenioritySchema.optional()),
  keywordWeight: z.coerce.number().min(0).max(10).optional(),
  semanticWeight: z.coerce.number().min(0).max(10).optional(),
  rrfK: z.coerce.number().int().min(1).max(1000).optional(),
});
export type MatchQuery = z.infer<typeof MatchQuerySchema>;

export const ExplanationRequestSchema = z.object({
  jobId: UuidSchema,
  candidateId: UuidSchema,
});

/** What the LLM must return (validated before it is cached or shown). */
export const ExplanationSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(40)
    .max(700)
    .refine((s) => {
      const n = countSentences(s);
      return n >= 2 && n <= 3;
    }, "summary must be 2–3 sentences"),
  matched_skills: z.array(z.string().trim().min(1).max(60)).max(30),
  missing_skills: z.array(z.string().trim().min(1).max(60)).max(30),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export function countSentences(text: string): number {
  // Treat "e.g." / "i.e." / decimals as non-terminal.
  const cleaned = text.replace(/\b(e\.g|i\.e|etc|vs)\./gi, "$1").replace(/(\d)\.(\d)/g, "$1$2");
  return cleaned.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 0).length;
}
