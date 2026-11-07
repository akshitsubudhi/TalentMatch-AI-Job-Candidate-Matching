import { describe, expect, it, vi } from "vitest";
import { createEmbedder, EmbeddingError, HashingEmbedder, OpenAIEmbedder, toPgVector } from "../src/embeddings";

const cosine = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] as number), 0);

describe("HashingEmbedder", () => {
  const e = new HashingEmbedder();
  it("returns unit-length 1536-d vectors deterministically", async () => {
    const [a, b] = await e.embed(["Senior Python engineer", "Senior Python engineer"]);
    expect(a).toHaveLength(1536);
    expect(Math.sqrt(cosine(a!, a!))).toBeCloseTo(1, 10);
    expect(a).toEqual(b);
  });
  it("scores lexically similar texts above unrelated ones", async () => {
    const [q, near, far] = await e.embed([
      "PostgreSQL database tuning",
      "Tuned Postgres databases",
      "Figma prototypes for mobile onboarding",
    ]);
    expect(cosine(q!, near!)).toBeGreaterThan(cosine(q!, far!));
  });
  it("never returns a zero vector", async () => {
    const [v] = await e.embed([""]);
    expect(Math.sqrt(cosine(v!, v!))).toBeCloseTo(1);
  });
});

describe("OpenAIEmbedder (mocked client)", () => {
  const vec = (seed: number) => Array.from({ length: 1536 }, (_, i) => Math.sin(seed + i));

  it("batches requests and preserves input order", async () => {
    const create = vi.fn(async ({ input }: { input: string[] }) => ({
      // Return out of order to prove we sort by index.
      data: input.map((_, index) => ({ index, embedding: vec(index) })).reverse(),
    }));
    const embedder = new OpenAIEmbedder({ client: { embeddings: { create } } as never, batchSize: 2 });
    const out = await embedder.embed(["a", "b", "c"]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![0]).toMatchObject({ model: "text-embedding-3-small", input: ["a", "b"], dimensions: 1536 });
    expect(out).toEqual([vec(0), vec(1), vec(0)]);
  });

  it("wraps API failures and rejects wrong dimensions", async () => {
    const failing = new OpenAIEmbedder({
      client: { embeddings: { create: vi.fn().mockRejectedValue(new Error("429 quota")) } } as never,
    });
    await expect(failing.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
    const wrongDims = new OpenAIEmbedder({
      client: { embeddings: { create: vi.fn().mockResolvedValue({ data: [{ index: 0, embedding: [1, 2] }] }) } } as never,
    });
    await expect(wrongDims.embed(["x"])).rejects.toThrow(/1536 dimensions/);
  });
});

describe("createEmbedder", () => {
  it("selects providers from env", () => {
    expect(createEmbedder({ EMBEDDINGS_PROVIDER: "local-hash" }).model).toBe("local-hash-v1");
    expect(createEmbedder({ EMBEDDINGS_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }).model).toBe("text-embedding-3-small");
    expect(() => createEmbedder({ EMBEDDINGS_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(() => createEmbedder({ EMBEDDINGS_PROVIDER: "nope" })).toThrow(/Unknown/);
  });
  it("formats pgvector literals", () => {
    expect(toPgVector([0.5, -1, 2])).toBe("[0.5,-1,2]");
  });
});
