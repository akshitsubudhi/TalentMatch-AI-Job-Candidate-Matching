/**
 * Sliding-window token budget (e.g. OpenAI's tokens-per-minute limit). acquire(n)
 * resolves once spending n more tokens keeps the trailing window within the limit.
 * Callers are served in FIFO order so large requests cannot starve.
 */
export class TokenRateLimiter {
  private readonly events: { at: number; tokens: number }[] = [];
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly tokensPerWindow: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    if (!(tokensPerWindow > 0)) throw new RangeError("tokensPerWindow must be > 0");
  }

  acquire(tokens: number): Promise<void> {
    // A single request larger than the budget is clamped so it can still run, alone.
    const cost = Math.min(tokens, this.tokensPerWindow);
    const run = this.tail.then(() => this.waitFor(cost));
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async waitFor(cost: number): Promise<void> {
    for (;;) {
      const t = this.now();
      while (this.events.length > 0 && this.events[0]!.at <= t - this.windowMs) this.events.shift();
      const used = this.events.reduce((s, e) => s + e.tokens, 0);
      if (used + cost <= this.tokensPerWindow) {
        this.events.push({ at: t, tokens: cost });
        return;
      }
      // Wait until enough of the oldest spending leaves the window.
      let freed = 0;
      let waitUntil = t;
      for (const e of this.events) {
        freed += e.tokens;
        waitUntil = e.at + this.windowMs;
        if (used - freed + cost <= this.tokensPerWindow) break;
      }
      await this.sleep(Math.max(1, waitUntil - t));
    }
  }
}
