export class RateLimiter {
  private minInterval: number;
  private lastAcquireTime = 0;

  constructor(qps: number) {
    this.minInterval = 1000 / qps;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastAcquireTime;
    const wait = this.minInterval - elapsed;

    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }

    this.lastAcquireTime = Date.now();
  }
}
