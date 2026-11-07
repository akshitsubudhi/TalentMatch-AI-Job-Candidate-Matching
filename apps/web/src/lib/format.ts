import { relativeMatchScore } from "@talentmatch/core/rrf";
import type { SearchWeights } from "./types";

export function matchPercent(rrfScore: number, weights: SearchWeights): number {
  const active = [weights.keywordWeight, weights.semanticWeight].filter((w) => w > 0);
  return relativeMatchScore(rrfScore, active, weights.rrfK);
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}
