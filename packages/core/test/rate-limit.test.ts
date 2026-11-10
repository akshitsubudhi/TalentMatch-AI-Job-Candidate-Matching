import { describe, expect, it, vi } from "vitest";
import { TokenRateLimiter } from "../src/embeddings/rate-limit";
import { OpenAIEmbedder } from "../src/embeddings";

/** Fake clock: sleep() advances time instantly. */
function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
    get time() {
      return t;
    },
  };
}

describe("TokenRateLimiter", () => {
  it("lets requests through immediately while under budget", async () => {
    const c = fakeClock();
    const l = new TokenRateLimiter(100, 60_000, c.now, c.sleep);
    await l.acquire(40);
    await l.acquire(60);
    expect(c.sleeps).toEqual([]);
  });

  it("waits for the window to free up instead of exceeding it", async () => {
    const c = fakeClock();
    const l = new TokenRateLimiter(100, 60_000, c.now, c.sleep);
    await l.acquire(70);
    await l.acquire(50); // 120 > 100: must wait until the first spend leaves the window
    expect(c.time).toBe(60_000);
  });

  it("never exceeds the budget in any trailing window, in FIFO order", async () => {
    const c = fakeClock();
    const l = new TokenRateLimiter(1000, 60_000, c.now, c.sleep);
    const log: { at: number; tokens: number; i: number }[] = [];
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => l.acquire(150).then(() => log.push({ at: c.time, tokens: 150, i }))),
    );
    expect(log.map((e) => e.i)).toEqual(log.map((_, i) => i));
    for (const e of log) {
      const inWindow = log.filter((x) => x.at > e.at - 60_000 && x.at <= e.at).reduce((s, x) => s + x.tokens, 0);
      expect(inWindow).toBeLessThanOrEqual(1000);
    }
  });

  it("clamps a single oversized request so it can still run", async () => {
    const c = fakeClock();
    const l = new TokenRateLimiter(100, 60_000, c.now, c.sleep);
    await expect(l.acquire(500)).resolves.toBeUndefined();
  });
});

describe("OpenAIEmbedder with tokensPerMinute", () => {
  it("still embeds correctly when pacing is enabled", async () => {
    const create = vi.fn(async ({ input }: { input: string[] }) => ({
      data: input.map((_, index) => ({ index, embedding: new Array(1536).fill(0.01) })),
    }));
    const e = new OpenAIEmbedder({ client: { embeddings: { create } } as never, tokensPerMinute: 1_000_000 });
    expect(await e.embed(["a", "b"])).toHaveLength(2);
  });
});
