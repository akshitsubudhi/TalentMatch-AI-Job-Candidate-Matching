import { describe, expect, it, vi } from "vitest";
import { BatchingEmbedder, HashingEmbedder, type Embedder } from "../src/embeddings";

function spyEmbedder() {
  const inner = new HashingEmbedder();
  const embed = vi.spyOn(inner, "embed");
  return { inner: inner as Embedder, embed };
}

describe("BatchingEmbedder", () => {
  it("coalesces concurrent calls into one request and routes results back in order", async () => {
    const { inner, embed } = spyEmbedder();
    const b = new BatchingEmbedder(inner, { maxBatchSize: 96, maxWaitMs: 5 });
    const inputs = [["a", "b"], ["c"], ["d", "e", "f"]];
    const results = await Promise.all(inputs.map((t) => b.embed(t)));
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]![0]).toEqual(["a", "b", "c", "d", "e", "f"]);
    const direct = new HashingEmbedder();
    for (const [i, texts] of inputs.entries()) expect(results[i]).toEqual(await direct.embed(texts));
    expect(b.model).toBe(inner.model);
  });

  it("splits into requests no larger than maxBatchSize without splitting a call", async () => {
    const { inner, embed } = spyEmbedder();
    const b = new BatchingEmbedder(inner, { maxBatchSize: 4, maxWaitMs: 5 });
    const results = await Promise.all([["1", "2"], ["3", "4"], ["5", "6", "7"], ["8"]].map((t) => b.embed(t)));
    expect(results.map((r) => r.length)).toEqual([2, 2, 3, 1]);
    for (const call of embed.mock.calls) expect(call[0].length).toBeLessThanOrEqual(4);
    expect(embed.mock.calls.flatMap((c) => c[0])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("rejects every caller in a failed batch, and later batches still work", async () => {
    let fail = true;
    const inner: Embedder = {
      model: "m",
      dimensions: 1,
      embed: async (texts) => {
        if (fail) throw new Error("429");
        return texts.map(() => [1]);
      },
    };
    const b = new BatchingEmbedder(inner, { maxWaitMs: 1 });
    const settled = await Promise.allSettled([b.embed(["x"]), b.embed(["y"])]);
    expect(settled.every((s) => s.status === "rejected")).toBe(true);
    fail = false;
    await expect(b.embed(["z"])).resolves.toEqual([[1]]);
  });

  it("passes through empty and oversized calls", async () => {
    const { inner, embed } = spyEmbedder();
    const b = new BatchingEmbedder(inner, { maxBatchSize: 2 });
    expect(await b.embed([])).toEqual([]);
    expect(await b.embed(["a", "b", "c"])).toHaveLength(3);
    expect(embed).toHaveBeenCalledTimes(1);
  });
});
