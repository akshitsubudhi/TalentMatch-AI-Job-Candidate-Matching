import type { SearchWeights } from "@/lib/types";
import { matchPercent } from "@/lib/format";

/** Fusion score plus the per-retriever ranks it came from. */
export function MatchScore({
  rrfScore,
  keywordRank,
  semanticRank,
  semanticSimilarity,
  weights,
}: {
  rrfScore: number;
  keywordRank: number | null;
  semanticRank: number | null;
  semanticSimilarity: number | null;
  weights: SearchWeights;
}) {
  const pct = matchPercent(rrfScore, weights);
  return (
    <div className="flex min-w-36 flex-col items-start gap-1 sm:items-end">
      <div
        className="flex items-baseline gap-1"
        title="Reciprocal Rank Fusion score relative to the best possible (rank 1 in both keyword and semantic lists). It measures agreement between retrievers, not a probability of fit."
      >
        <span className="text-2xl font-semibold tabular-nums">{pct}</span>
        <span className="text-xs text-slate-500">/ 100 fusion</span>
      </div>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <dl className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <dt className="sr-only">Keyword rank</dt>
          <dd>Keyword {keywordRank ? `#${keywordRank}` : "—"}</dd>
        </div>
        <div>
          <dt className="sr-only">Semantic rank</dt>
          <dd>
            Semantic {semanticRank ? `#${semanticRank}` : "—"}
            {semanticSimilarity !== null && semanticRank ? ` (${semanticSimilarity.toFixed(2)})` : ""}
          </dd>
        </div>
      </dl>
    </div>
  );
}
