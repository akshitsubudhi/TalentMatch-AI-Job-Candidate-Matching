import { describe, expect, it } from "vitest";
import { maxRrfScore, relativeMatchScore, rrfFuse } from "../src/search/rrf";
import { mean, percentile, reciprocalRank, recallAtK } from "../src/search/metrics";

describe("rrfFuse", () => {
  it("computes weighted reciprocal-rank scores", () => {
    const fused = rrfFuse(
      [
        { name: "keyword", weight: 1, ids: ["a", "b", "c"] },
        { name: "semantic", weight: 1, ids: ["b", "d"] },
      ],
      60,
    );
    const byId = Object.fromEntries(fused.map((r) => [r.id, r]));
    expect(byId.b!.score).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(byId.a!.score).toBeCloseTo(1 / 61, 12);
    expect(byId.d!.score).toBeCloseTo(1 / 62, 12);
    expect(byId.c!.score).toBeCloseTo(1 / 63, 12);
    expect(fused.map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
    expect(byId.b!.ranks).toEqual({ keyword: 2, semantic: 1 });
    expect(byId.c!.ranks).toEqual({ keyword: 3, semantic: null });
  });

  it("rewards documents found by both retrievers over a single top hit", () => {
    const fused = rrfFuse([
      { name: "keyword", weight: 1, ids: ["solo", "both"] },
      { name: "semantic", weight: 1, ids: ["x", "both"] },
    ]);
    expect(fused[0]!.id).toBe("both");
  });

  it("respects weights (weight 0 removes a list's influence)", () => {
    const lists = [
      { name: "keyword", weight: 0, ids: ["a", "b"] },
      { name: "semantic", weight: 1, ids: ["b", "a"] },
    ];
    expect(rrfFuse(lists).map((r) => r.id)).toEqual(["b", "a"]);
    const kwHeavy = rrfFuse([
      { name: "keyword", weight: 3, ids: ["a", "b"] },
      { name: "semantic", weight: 1, ids: ["b", "a"] },
    ]);
    expect(kwHeavy[0]!.id).toBe("a");
  });

  it("smaller k makes top ranks matter more", () => {
    const lists = [
      { name: "keyword", weight: 1, ids: ["a", "x1", "x2", "x3", "b"] },
      { name: "semantic", weight: 1, ids: ["y1", "b", "y2", "y3", "y4", "y5", "y6", "y7", "a"] },
    ];
    // k=60: b (5,2) beats a (1,9). k=1: a's rank-1 dominates.
    expect(rrfFuse(lists, 60)[0]!.id).toBe("b");
    expect(rrfFuse(lists, 1)[0]!.id).toBe("a");
  });

  it("breaks ties by id and ignores duplicate ids within a list", () => {
    const fused = rrfFuse([{ name: "keyword", weight: 1, ids: ["b", "b", "a"] }]);
    expect(fused.map((r) => [r.id, r.ranks.keyword])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
    const tie = rrfFuse([
      { name: "k", weight: 1, ids: ["z"] },
      { name: "s", weight: 1, ids: ["a"] },
    ]);
    expect(tie.map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("validates inputs", () => {
    expect(() => rrfFuse([], 0)).toThrow(RangeError);
    expect(() => rrfFuse([{ name: "k", weight: -1, ids: [] }])).toThrow(RangeError);
    expect(() =>
      rrfFuse([
        { name: "k", weight: 1, ids: [] },
        { name: "k", weight: 1, ids: [] },
      ]),
    ).toThrow(/duplicate/);
    expect(rrfFuse([])).toEqual([]);
  });

  it("relativeMatchScore is 100 for rank 1 in both lists", () => {
    expect(maxRrfScore([1, 1], 60)).toBeCloseTo(2 / 61);
    expect(relativeMatchScore(2 / 61, [1, 1], 60)).toBe(100);
    expect(relativeMatchScore(1 / 61, [1, 1], 60)).toBe(50);
    expect(relativeMatchScore(5, [1, 1], 60)).toBe(100);
    expect(relativeMatchScore(1, [0, 0], 60)).toBe(0);
  });
});

describe("retrieval metrics", () => {
  const relevant = new Set(["a", "b", "c", "d"]);
  it("recall@k", () => {
    expect(recallAtK(["a", "x", "b"], relevant, 2)).toBe(0.25);
    expect(recallAtK(["a", "x", "b"], relevant, 10)).toBe(0.5);
    expect(recallAtK(["a"], new Set(), 10)).toBe(0);
  });
  it("reciprocal rank", () => {
    expect(reciprocalRank(["x", "y", "c"], relevant)).toBeCloseTo(1 / 3);
    expect(reciprocalRank(["x"], relevant)).toBe(0);
    expect(reciprocalRank(["a"], relevant)).toBe(1);
  });
  it("percentile and mean", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(v, 50)).toBeCloseTo(5.5);
    expect(percentile(v, 95)).toBeCloseTo(9.55);
    expect(percentile([7], 95)).toBe(7);
    expect(() => percentile([], 50)).toThrow();
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });
});
