import { describe, expect, it } from "vitest";
import { matchPercent } from "../src/lib/format";
import { parseListParams, parseMatchParams } from "../src/lib/search-params";

describe("search params", () => {
  it("parses list params and falls back on bad values", () => {
    expect(parseListParams({ page: "3", location: "Remote", seniority: "senior" })).toEqual({ page: 3, location: "Remote", seniority: "senior" });
    expect(parseListParams({ page: "-1", seniority: "boss", location: "" })).toEqual({ page: 1, location: undefined, seniority: undefined });
    expect(parseListParams({ page: ["2", "9"] }).page).toBe(2);
  });

  it("parses match params (weights, k, filters) and reports invalid ones", () => {
    const ok = parseMatchParams({ kw: "2", sem: "0.5", k: "30", limit: "5", seniority: "lead" });
    expect(ok.error).toBeNull();
    expect(ok.query).toMatchObject({ keywordWeight: 2, semanticWeight: 0.5, rrfK: 30, limit: 5, seniority: "lead" });
    const bad = parseMatchParams({ limit: "500" });
    expect(bad.error).toMatch(/limit/);
    expect(bad.query.limit).toBe(10);
  });
});

describe("matchPercent", () => {
  it("is relative to rank 1 in all active lists", () => {
    const w = { keywordWeight: 1, semanticWeight: 1, rrfK: 60 };
    expect(matchPercent(2 / 61, w)).toBe(100);
    expect(matchPercent(1 / 61, { ...w, keywordWeight: 0 })).toBe(100);
  });
});
