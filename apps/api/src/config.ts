import { z } from "zod";
import { withoutEmptyStrings } from "@talentmatch/core";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().url(),
    DATABASE_SSL: z.enum(["disable", "no-verify", "verify"]).optional(),
    DATABASE_CA_CERT: z.string().optional(),
    INGEST_API_KEY: z.string().min(16).optional(),
    EMBEDDINGS_PROVIDER: z.enum(["openai", "ollama", "local-hash"]).default("openai"),
    OLLAMA_BASE_URL: z.string().url().optional(),
    OLLAMA_EMBEDDING_MODEL: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    OPENAI_EMBEDDING_TPM: z.coerce.number().int().positive().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(20 * 1024 * 1024).default(5 * 1024 * 1024),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.INGEST_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["INGEST_API_KEY"], message: "INGEST_API_KEY is required in production" });
    }
    if (env.EMBEDDINGS_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "required when EMBEDDINGS_PROVIDER=openai" });
    }
  });

export type ApiConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = EnvSchema.safeParse(withoutEmptyStrings(env));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
