/** Retrieval metrics used by scripts/benchmark.ts. */

/** |relevant ∩ top-k| / |relevant|. Returns 0 when there are no relevant ids. */
export function recallAtK(ranked: readonly string[], relevant: ReadonlySet<string>, k: number): number {
  if (relevant.size === 0) return 0;
  let hits = 0;
  for (const id of ranked.slice(0, k)) if (relevant.has(id)) hits += 1;
  return hits / relevant.size;
}

/** Reciprocal rank of the first relevant id (0 if none is retrieved). */
export function reciprocalRank(ranked: readonly string[], relevant: ReadonlySet<string>): number {
  const idx = ranked.findIndex((id) => relevant.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Percentile with linear interpolation between closest ranks (p in [0, 100]). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError("percentile of empty array");
  if (p < 0 || p > 100) throw new RangeError("p must be in [0, 100]");
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loVal = sorted[lo] as number;
  const hiVal = sorted[hi] as number;
  return loVal + (hiVal - loVal) * (pos - lo);
}
