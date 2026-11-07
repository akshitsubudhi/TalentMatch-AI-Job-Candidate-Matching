import { describe, expect, it } from "vitest";
import { chunkText, estimateTokens } from "../src/text/chunk";

const sentence = (i: number) => `Sentence number ${i} talks about building reliable distributed systems.`;

describe("estimateTokens", () => {
  it("is ~chars/4 and 0 for blank input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("   ")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("  \n ")).toEqual([]);
  });

  it("keeps short text in a single chunk", () => {
    const chunks = chunkText("Hello world. This is short.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, content: "Hello world. This is short." });
  });

  it("splits long text into chunks under the token budget", () => {
    const text = Array.from({ length: 200 }, (_, i) => sentence(i)).join(" ");
    const chunks = chunkText(text, { maxTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.tokenEstimate).toBeLessThanOrEqual(100);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("covers every sentence and overlaps adjacent chunks", () => {
    const sentences = Array.from({ length: 60 }, (_, i) => sentence(i));
    const chunks = chunkText(sentences.join(" "), { maxTokens: 80, overlapTokens: 20 });
    const joined = chunks.map((c) => c.content).join(" ");
    for (const s of sentences) expect(joined).toContain(s);
    // Each chunk after the first starts with the last sentence of the previous chunk.
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!.content;
      const lastPrev = prev.slice(prev.lastIndexOf("Sentence number"));
      expect(chunks[i]!.content.startsWith(lastPrev)).toBe(true);
    }
  });

  it("produces no overlap when overlapTokens is 0", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => sentence(i));
    const chunks = chunkText(sentences.join(" "), { maxTokens: 60, overlapTokens: 0 });
    const total = chunks.map((c) => c.content.split("Sentence number").length - 1).reduce((a, b) => a + b, 0);
    expect(total).toBe(40);
  });

  it("hard-splits a single huge unpunctuated run", () => {
    const words = Array.from({ length: 2000 }, (_, i) => `skill${i}`).join(" ");
    const chunks = chunkText(words, { maxTokens: 64, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(10);
    for (const chunk of chunks) expect(chunk.tokenEstimate).toBeLessThanOrEqual(64);
    expect(chunks.map((c) => c.content).join(" ")).toBe(words);
  });

  it("splits a single giant token", () => {
    const chunks = chunkText("x".repeat(1000), { maxTokens: 32, overlapTokens: 0 });
    expect(chunks.map((c) => c.content).join("")).toBe("x".repeat(1000));
    for (const chunk of chunks) expect(chunk.tokenEstimate).toBeLessThanOrEqual(32);
  });

  it("is deterministic", () => {
    const text = Array.from({ length: 80 }, (_, i) => sentence(i)).join(" ");
    expect(chunkText(text, { maxTokens: 90 })).toEqual(chunkText(text, { maxTokens: 90 }));
  });

  it("rejects invalid options", () => {
    expect(() => chunkText("a", { maxTokens: 4 })).toThrow(RangeError);
    expect(() => chunkText("a", { maxTokens: 100, overlapTokens: 60 })).toThrow(RangeError);
    expect(() => chunkText("a", { maxTokens: 100, overlapTokens: -1 })).toThrow(RangeError);
  });
});
