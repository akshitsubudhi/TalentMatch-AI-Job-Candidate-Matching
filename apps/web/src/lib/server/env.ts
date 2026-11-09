import "server-only";
import { z } from "zod";
import { withoutEmptyStrings } from "@talentmatch/core";

const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  INGEST_API_URL: z.string().url().default("http://localhost:4000"),
  INGEST_API_KEY: z.string().optional(),
  EXPLANATIONS_PROVIDER: z.enum(["openai", "ollama", "rules"]).default("openai"),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_CHAT_MODEL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_REASONING_EFFORT: z.string().optional(),
  SEARCH_KEYWORD_WEIGHT: z.coerce.number().min(0).max(10).default(1),
  SEARCH_SEMANTIC_WEIGHT: z.coerce.number().min(0).max(10).default(1),
  SEARCH_RRF_K: z.coerce.number().int().min(1).max(1000).default(60),
  EXPLAIN_TOP_N: z.coerce.number().int().min(0).max(20).default(5),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

/** Validated server-side configuration. Never import this from a client component. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(withoutEmptyStrings(process.env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export function searchDefaults() {
  const env = serverEnv();
  return { keywordWeight: env.SEARCH_KEYWORD_WEIGHT, semanticWeight: env.SEARCH_SEMANTIC_WEIGHT, rrfK: env.SEARCH_RRF_K };
}
