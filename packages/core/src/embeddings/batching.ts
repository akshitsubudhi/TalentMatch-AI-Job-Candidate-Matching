import type { Embedder } from "./types";

interface Pending {
  texts: readonly string[];
  resolve: (vectors: number[][]) => void;
  reject: (error: unknown) => void;
}

export interface BatchingOptions {
  /** Max inputs per underlying request. */
  maxBatchSize?: number;
  /** How long to wait for more concurrent calls before sending a partial batch. */
  maxWaitMs?: number;
}

/**
 * Coalesces concurrent embed() calls into fewer, larger provider requests
 * (DataLoader-style micro-batching). Ingesting many resumes concurrently then
 * costs ~N/96 HTTP round trips instead of N. Results are routed back to each
 * caller in order; a failed request rejects every caller in that batch.
 */
export class BatchingEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  private readonly maxBatchSize: number;
  private readonly maxWaitMs: number;
  private queue: Pending[] = [];
  private queuedInputs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly inner: Embedder,
    options: BatchingOptions = {},
  ) {
    this.model = inner.model;
    this.dimensions = inner.dimensions;
    this.maxBatchSize = options.maxBatchSize ?? 96;
    this.maxWaitMs = options.maxWaitMs ?? 15;
  }

  embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return Promise.resolve([]);
    // Oversized requests skip the queue (the inner embedder batches them itself).
    if (texts.length >= this.maxBatchSize) return this.inner.embed(texts);
    return new Promise((resolve, reject) => {
      this.queue.push({ texts, resolve, reject });
      this.queuedInputs += texts.length;
      if (this.queuedInputs >= this.maxBatchSize) this.flush();
      else this.timer ??= setTimeout(() => this.flush(), this.maxWaitMs);
    });
  }

  private flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Take whole calls until the batch is full (a call is never split across requests).
    const batch: Pending[] = [];
    let size = 0;
    while (this.queue.length > 0 && size + this.queue[0]!.texts.length <= this.maxBatchSize) {
      const next = this.queue.shift()!;
      batch.push(next);
      size += next.texts.length;
    }
    this.queuedInputs -= size;
    if (this.queue.length > 0) this.timer = setTimeout(() => this.flush(), 0);
    if (batch.length === 0) return;

    this.inner.embed(batch.flatMap((p) => p.texts)).then(
      (vectors) => {
        let offset = 0;
        for (const p of batch) {
          p.resolve(vectors.slice(offset, offset + p.texts.length));
          offset += p.texts.length;
        }
      },
      (error: unknown) => {
        for (const p of batch) p.reject(error);
      },
    );
  }
}
