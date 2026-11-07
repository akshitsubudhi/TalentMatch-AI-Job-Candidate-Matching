/**
 * Weighted Reciprocal Rank Fusion (Cormack, Clarke & Büttcher, SIGIR 2009).
 *
 *   score(d) = Σ_lists  weight_list / (k + rank_list(d))       (ranks are 1-based)
 *
 * Lists where d does not appear contribute 0. This is the TypeScript reference
 * implementation of the fusion done in SQL by public.match_candidates_for_job /
 * public.match_jobs_for_candidate; the DB test suite checks the two agree.
 */
export interface RankedList {
  name: string;
  weight: number;
  /** Document ids, best first. Duplicates after the first occurrence are ignored. */
  ids: readonly string[];
}

export interface FusedResult {
  id: string;
  score: number;
  ranks: Record<string, number | null>;
}

export const DEFAULT_RRF_K = 60;

export function rrfFuse(lists: readonly RankedList[], k: number = DEFAULT_RRF_K): FusedResult[] {
  if (!Number.isFinite(k) || k < 1) throw new RangeError("k must be >= 1");
  for (const list of lists) {
    if (!Number.isFinite(list.weight) || list.weight < 0) {
      throw new RangeError(`weight for list "${list.name}" must be a finite number >= 0`);
    }
  }
  const names = new Set<string>();
  for (const list of lists) {
    if (names.has(list.name)) throw new Error(`duplicate list name "${list.name}"`);
    names.add(list.name);
  }

  const results = new Map<string, FusedResult>();
  const emptyRanks = (): Record<string, number | null> =>
    Object.fromEntries(lists.map((l) => [l.name, null]));

  for (const list of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const id of list.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      rank += 1;
      let entry = results.get(id);
      if (!entry) {
        entry = { id, score: 0, ranks: emptyRanks() };
        results.set(id, entry);
      }
      entry.ranks[list.name] = rank;
      entry.score += list.weight / (k + rank);
    }
  }

  // Deterministic: score desc, then id asc (same tie-break as the SQL).
  return [...results.values()].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** Highest score a document can reach: rank 1 in every list with weight > 0. */
export function maxRrfScore(weights: readonly number[], k: number = DEFAULT_RRF_K): number {
  return weights.reduce((sum, w) => sum + w / (k + 1), 0);
}

/**
 * Map an RRF score to 0–100 relative to the best possible score. This is a
 * *rank-agreement* indicator, not a probability of fit; the UI labels it as such.
 */
export function relativeMatchScore(score: number, weights: readonly number[], k: number = DEFAULT_RRF_K): number {
  const max = maxRrfScore(weights, k);
  if (max <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, score / max)) * 100);
}
