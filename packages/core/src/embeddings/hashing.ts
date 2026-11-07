import { EMBEDDING_DIMENSIONS, type Embedder } from "./types";

/**
 * Deterministic, offline "feature hashing" embedder (a.k.a. the hashing trick).
 *
 * THIS IS NOT A SEMANTIC MODEL. It hashes word unigrams, word bigrams and
 * character trigrams into a 1536-dim signed vector (sublinear TF, L2-normalised).
 * Cosine similarity between two vectors therefore measures *lexical/sub-word*
 * overlap: it catches "Postgres" ~ "PostgreSQL" via shared trigrams, but not
 * "container orchestration" ~ "Kubernetes".
 *
 * It exists so that tests, CI, the seed script and the benchmark can run with no
 * network access or API spend. Use EMBEDDINGS_PROVIDER=openai for real semantics.
 */
export class HashingEmbedder implements Embedder {
  readonly model = "local-hash-v1";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.embedOne(t)));
  }

  embedOne(text: string): number[] {
    const vector = new Float64Array(this.dimensions);
    const features = new Map<string, number>();
    const add = (feature: string, weight: number) =>
      features.set(feature, (features.get(feature) ?? 0) + weight);

    const words = tokenize(text);
    for (let i = 0; i < words.length; i++) {
      const word = words[i] as string;
      add(`w:${word}`, 1);
      const next = words[i + 1];
      if (next !== undefined) add(`b:${word} ${next}`, 0.5);
      const padded = `<${word}>`;
      for (let j = 0; j + 3 <= padded.length; j++) add(`c:${padded.slice(j, j + 3)}`, 0.25);
    }

    for (const [feature, weight] of features) {
      const h = fnv1a(feature);
      const index = h % this.dimensions;
      const sign = (fnv1a(`s:${feature}`) & 1) === 0 ? 1 : -1;
      vector[index] = (vector[index] as number) + sign * (1 + Math.log(weight + 1));
    }

    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) {
      // pgvector's cosine distance is undefined for zero vectors.
      const out = new Array<number>(this.dimensions).fill(0);
      out[0] = 1;
      return out;
    }
    return Array.from(vector, (v) => v / norm);
  }
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with we our you your i my me".split(
    " ",
  ),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) ?? [])
    .map((w) => w.replace(/\.+$/, ""))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/** 32-bit FNV-1a. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
