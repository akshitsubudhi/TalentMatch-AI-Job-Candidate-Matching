/**
 * Sentence-aware chunking for long resumes.
 *
 * Token counts are an *estimate* (≈ 4 characters per token for English text, the
 * rule of thumb OpenAI documents for its tokenizers). Chunks are far below the
 * 8,191-token input limit of text-embedding-3-small, so an estimate is sufficient;
 * we avoid bundling a tokenizer.
 */
export interface ChunkOptions {
  /** Target maximum size of a chunk, in estimated tokens. */
  maxTokens?: number;
  /** Approximate overlap carried from the end of one chunk into the next. */
  overlapTokens?: number;
}

export interface TextChunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

export const DEFAULT_CHUNK_OPTIONS = { maxTokens: 350, overlapTokens: 50 } as const;

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_CHUNK_OPTIONS.maxTokens;
  // Default overlap scales down for small chunk sizes so it stays valid.
  const overlapTokens =
    options.overlapTokens ?? Math.min(DEFAULT_CHUNK_OPTIONS.overlapTokens, Math.floor(maxTokens / 4));
  if (!Number.isInteger(maxTokens) || maxTokens < 16) {
    throw new RangeError("maxTokens must be an integer >= 16");
  }
  if (!Number.isInteger(overlapTokens) || overlapTokens < 0 || overlapTokens >= maxTokens / 2) {
    throw new RangeError("overlapTokens must be an integer in [0, maxTokens / 2)");
  }

  const units = splitIntoUnits(text, maxTokens);
  if (units.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    if (current.length > 0 && currentTokens + unitTokens > maxTokens) {
      chunks.push(current.join(" "));
      // Carry trailing units forward as overlap (never the whole chunk).
      const overlap: string[] = [];
      let overlapSize = 0;
      for (let i = current.length - 1; i > 0; i--) {
        const candidate = current[i] as string;
        const size = estimateTokens(candidate);
        if (overlapSize + size > overlapTokens) break;
        overlap.unshift(candidate);
        overlapSize += size;
      }
      current = overlap;
      currentTokens = overlapSize;
    }
    current.push(unit);
    currentTokens += unitTokens;
  }
  if (current.length > 0) chunks.push(current.join(" "));

  return chunks.map((content, index) => ({
    index,
    content,
    tokenEstimate: estimateTokens(content),
  }));
}

/** Split into sentence-like units; hard-split any unit larger than maxTokens. */
function splitIntoUnits(text: string, maxTokens: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return [];

  // Sentence boundaries, plus the " - " bullet separators that survive cleanText.
  const rough = normalized
    .split(/(?<=[.!?;])\s+(?=[A-Z0-9"'(-])|\s+(?=- )/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const units: string[] = [];
  const maxChars = maxTokens * 4;
  for (const sentence of rough) {
    if (estimateTokens(sentence) <= maxTokens) {
      units.push(sentence);
      continue;
    }
    // Very long "sentence" (e.g. a skills list with no punctuation): split on words.
    let buffer = "";
    for (const word of sentence.split(" ")) {
      if (word.length > maxChars) {
        if (buffer) units.push(buffer);
        buffer = "";
        for (let i = 0; i < word.length; i += maxChars) units.push(word.slice(i, i + maxChars));
        continue;
      }
      const next = buffer ? `${buffer} ${word}` : word;
      if (next.length > maxChars) {
        units.push(buffer);
        buffer = word;
      } else {
        buffer = next;
      }
    }
    if (buffer) units.push(buffer);
  }
  return units;
}
