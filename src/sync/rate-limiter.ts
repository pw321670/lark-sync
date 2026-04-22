export interface RateLimitPenaltyOptions {
  retryAfterMs?: number;
}

export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly basePenaltyMs: number;
  private readonly maxPenaltyMs: number;
  private queue: Promise<void> = Promise.resolve();
  private nextAvailableAt = 0;
  private consecutiveRateLimitHits = 0;

  constructor(
    qps: number,
    options: {
      basePenaltyMs?: number;
      maxPenaltyMs?: number;
    } = {},
  ) {
    this.minIntervalMs = 1000 / Math.max(qps, 1);
    this.basePenaltyMs = options.basePenaltyMs ?? 1500;
    this.maxPenaltyMs = options.maxPenaltyMs ?? 30_000;
  }

  async acquire(): Promise<void> {
    const slot = this.queue.then(async () => {
      while (true) {
        const waitMs = this.nextAvailableAt - Date.now();
        if (waitMs <= 0) {
          break;
        }

        await this.sleep(waitMs);
      }

      this.nextAvailableAt = Date.now() + this.minIntervalMs;
    });

    this.queue = slot.catch(() => {});
    return slot;
  }

  noteSuccess(): void {
    this.consecutiveRateLimitHits = 0;
  }

  noteRateLimit(options: RateLimitPenaltyOptions = {}): number {
    this.consecutiveRateLimitHits += 1;

    const exponentialPenalty = Math.min(
      this.basePenaltyMs * Math.pow(2, this.consecutiveRateLimitHits - 1),
      this.maxPenaltyMs,
    );
    const penaltyMs = Math.max(options.retryAfterMs ?? 0, exponentialPenalty);

    this.nextAvailableAt = Math.max(this.nextAvailableAt, Date.now() + penaltyMs);

    return penaltyMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
