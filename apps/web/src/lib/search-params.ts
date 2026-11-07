import { MatchQuerySchema, SenioritySchema, type MatchQuery } from "@talentmatch/core";
import { z } from "zod";

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const ListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  location: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(120).optional()).catch(undefined),
  seniority: z.preprocess(emptyToUndefined, SenioritySchema.optional()).catch(undefined),
});

export function parseListParams(raw: RawSearchParams) {
  return ListParamsSchema.parse({ page: first(raw.page) ?? 1, location: first(raw.location), seniority: first(raw.seniority) });
}

/** Returns validated match filters, or the defaults plus an error message for the UI. */
export function parseMatchParams(raw: RawSearchParams): { query: MatchQuery; error: string | null } {
  const parsed = MatchQuerySchema.safeParse({
    limit: first(raw.limit),
    location: first(raw.location),
    seniority: first(raw.seniority),
    keywordWeight: first(raw.kw),
    semanticWeight: first(raw.sem),
    rrfK: first(raw.k),
  });
  if (parsed.success) return { query: parsed.data, error: null };
  return {
    query: MatchQuerySchema.parse({}),
    error: `Ignored invalid filters: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
  };
}
