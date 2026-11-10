import OpenAI from "openai";
import { HashingEmbedder } from "./hashing";
import { OpenAIEmbedder } from "./openai";
import type { Embedder } from "./types";

export * from "./types";
export { HashingEmbedder } from "./hashing";
export { OpenAIEmbedder } from "./openai";
export { BatchingEmbedder, type BatchingOptions } from "./batching";

export type EmbeddingsProvider = "openai" | "ollama" | "local-hash";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

export interface EmbedderEnv {
  EMBEDDINGS_PROVIDER?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_EMBEDDING_MODEL?: string | undefined;
  OPENAI_BASE_URL?: string | undefined;
  /** Client-side tokens-per-minute budget for embeddings (default 800000; your OpenAI tier's TPM limit minus a margin). */
  OPENAI_EMBEDDING_TPM?: string | number | undefined;
  OLLAMA_BASE_URL?: string | undefined;
  OLLAMA_EMBEDDING_MODEL?: string | undefined;
}

export function createEmbedder(env: EmbedderEnv): Embedder {
  const provider = (env.EMBEDDINGS_PROVIDER || "openai") as EmbeddingsProvider;
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
        // Bulk ingestion can hit the tokens-per-minute limit; the SDK backs off exponentially
        // and honours retry-after headers, so a generous retry budget rides out the window.
        maxRetries: 8,
        timeout: 60_000,
      });
      const tpm = Number(env.OPENAI_EMBEDDING_TPM || 800_000);
      if (!Number.isFinite(tpm) || tpm <= 0) throw new Error("OPENAI_EMBEDDING_TPM must be a positive number");
      return new OpenAIEmbedder({
        client,
        model: env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        tokensPerMinute: tpm,
      });
    }
    case "ollama": {
      // Ollama's OpenAI-compatible endpoint: the SDK requires an API key, Ollama ignores it.
      const model = env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
      const client = new OpenAI({
        apiKey: "ollama",
        baseURL: env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
        maxRetries: 2,
        timeout: 120_000,
      });
      return new OpenAIEmbedder({ client, model, label: `ollama/${model}`, requestDimensions: false, zeroPad: true, batchSize: 32 });
    }
    default:
      throw new Error(`Unknown EMBEDDINGS_PROVIDER "${String(provider)}" (expected "openai", "ollama" or "local-hash")`);
  }
}
