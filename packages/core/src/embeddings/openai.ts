import type OpenAI from "openai";
import { EMBEDDING_DIMENSIONS, EmbeddingError, type Embedder } from "./types";

export interface OpenAIEmbedderOptions {
  client: Pick<OpenAI, "embeddings">;
  model?: string;
  /** Inputs per request. The API accepts up to 2048; smaller batches fail faster. */
  batchSize?: number;
}

export class OpenAIEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly client: Pick<OpenAI, "embeddings">;
  private readonly batchSize: number;

  constructor(options: OpenAIEmbedderOptions) {
    this.client = options.client;
    this.model = options.model ?? "text-embedding-3-small";
    this.batchSize = options.batchSize ?? 96;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      let response;
      try {
        response = await this.client.embeddings.create({
          model: this.model,
          input: batch as string[],
          dimensions: this.dimensions,
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
        if (item.embedding.length !== this.dimensions) {
          throw new EmbeddingError(`expected ${this.dimensions} dimensions, got ${item.embedding.length}`);
        }
        out.push(item.embedding);
      }
    }
    return out;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
