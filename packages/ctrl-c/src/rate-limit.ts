/** Simple token-bucket rate limiter (per key). */
export class RateLimiter {
  private readonly buckets = new Map<
    string,
    { tokens: number; updatedAt: number }
  >();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number
  ) {}

  /** Returns true when the call is allowed. */
  tryTake(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? {
      tokens: this.capacity,
      updatedAt: now,
    };
    const elapsed = Math.max(0, now - bucket.updatedAt);
    const refilled = Math.min(
      this.capacity,
      bucket.tokens + elapsed * this.refillPerMs
    );
    if (refilled < 1) {
      this.buckets.set(key, { tokens: refilled, updatedAt: now });
      return false;
    }
    this.buckets.set(key, { tokens: refilled - 1, updatedAt: now });
    return true;
  }
}

/** Default: 5 messages / second per channel. */
export function createDefaultChannelRateLimiter(): RateLimiter {
  return new RateLimiter(5, 5 / 1000);
}
