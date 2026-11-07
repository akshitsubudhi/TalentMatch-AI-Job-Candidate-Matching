export const EMBEDDING_DIMENSIONS = 1536;

export interface Embedder {
  /** Stored alongside every vector so mixed-model data can be detected. */
  readonly model: string;
  readonly dimensions: number;
  /** Returns one vector per input, in the same order. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

/** pgvector text literal, e.g. "[0.1,0.2]". */
export function toPgVector(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}
