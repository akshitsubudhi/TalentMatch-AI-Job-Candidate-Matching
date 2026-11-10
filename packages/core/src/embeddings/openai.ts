import type OpenAI from "openai";
import { estimateTokens } from "../text/chunk";
import { TokenRateLimiter } from "./rate-limit";
import { EMBEDDING_DIMENSIONS, EmbeddingError, type Embedder } from "./types";

export interface OpenAIEmbedderOptions {
  client: Pick<OpenAI, "embeddings">;
  model?: string;
  /** Inputs per request. The API accepts up to 2048; smaller batches fail faster. */
  batchSize?: number;
  /**
   * Send `dimensions` in the request (only OpenAI's text-embedding-3-* models support it).
   * Set false for OpenAI-compatible servers such as Ollama.
   */
  requestDimensions?: boolean;
  /**
   * Zero-pad vectors shorter than 1536 (e.g. 768-d nomic-embed-text) so they fit the
   * vector(1536) columns. Zero-padding leaves dot products and norms unchanged, so cosine
   * similarity between two padded vectors equals cosine between the originals.
   */
  zeroPad?: boolean;
  /** Label stored in embedding_model (defaults to `model`). */
  label?: string;
  /**
   * Client-side tokens-per-minute budget. Requests wait instead of tripping the
   * provider's TPM limit during bulk ingestion. Unset = no client-side pacing.
   */
  tokensPerMinute?: number;
}

export class OpenAIEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly client: Pick<OpenAI, "embeddings">;
  private readonly batchSize: number;
  private readonly apiModel: string;
  private readonly requestDimensions: boolean;
  private readonly zeroPad: boolean;
  private readonly limiter: TokenRateLimiter | null;

  constructor(options: OpenAIEmbedderOptions) {
    this.client = options.client;
    this.apiModel = options.model ?? "text-embedding-3-small";
    this.model = options.label ?? this.apiModel;
    this.batchSize = options.batchSize ?? 96;
    this.requestDimensions = options.requestDimensions ?? true;
    this.zeroPad = options.zeroPad ?? false;
    this.limiter = options.tokensPerMinute ? new TokenRateLimiter(options.tokensPerMinute) : null;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      // ~4 chars/token estimate, +10% margin, plus per-input overhead.
      if (this.limiter) await this.limiter.acquire(Math.ceil(batch.reduce((s, t) => s + estimateTokens(t) + 4, 0) * 1.1));
      let response;
      try {
        response = await this.client.embeddings.create({
          model: this.apiModel,
          input: batch as string[],
          ...(this.requestDimensions ? { dimensions: this.dimensions } : {}),
          encoding_format: "float",
        });
      } catch (cause) {
        throw new EmbeddingError(`OpenAI embeddings request failed: ${describe(cause)}`, { cause });
      }
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      if (sorted.length !== batch.length) {
        throw new EmbeddingError(`expected ${batch.length} embeddings, got ${sorted.length}`);
      }
      for (const item of sorted) {
        const length = item.embedding.length;
        if (length === this.dimensions) {
          out.push(item.embedding);
        } else if (this.zeroPad && length > 0 && length < this.dimensions) {
          out.push([...item.embedding, ...new Array<number>(this.dimensions - length).fill(0)]);
        } else {
          throw new EmbeddingError(
            `expected ${this.dimensions} dimensions, got ${length}` +
              (length > this.dimensions ? " (models wider than 1536 dims are not supported by the schema)" : ""),
          );
        }
      }
    }
    return out;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
