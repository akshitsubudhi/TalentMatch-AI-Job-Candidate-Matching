import OpenAI from "openai";
import { HashingEmbedder } from "./hashing";
import { OpenAIEmbedder } from "./openai";
import type { Embedder } from "./types";

export * from "./types";
export { HashingEmbedder } from "./hashing";
export { OpenAIEmbedder } from "./openai";

export type EmbeddingsProvider = "openai" | "local-hash";

export interface EmbedderEnv {
  EMBEDDINGS_PROVIDER?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_EMBEDDING_MODEL?: string | undefined;
  OPENAI_BASE_URL?: string | undefined;
}

export function createEmbedder(env: EmbedderEnv): Embedder {
  const provider = (env.EMBEDDINGS_PROVIDER ?? "openai") as EmbeddingsProvider;
  switch (provider) {
    case "local-hash":
      return new HashingEmbedder();
    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER=openai");
      }
      const client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
        maxRetries: 3,
        timeout: 30_000,
      });
      return new OpenAIEmbedder({ client, model: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small" });
    }
    default:
      throw new Error(`Unknown EMBEDDINGS_PROVIDER "${String(provider)}" (expected "openai" or "local-hash")`);
  }
}
