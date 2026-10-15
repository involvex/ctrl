import { describe, expect, test } from 'bun:test';
import { RateLimiter } from './rate-limit';
import { nextRetryDelayMs, shouldRetry } from './retry';

describe('RateLimiter', () => {
  test('allows up to capacity then blocks', () => {
    const limiter = new RateLimiter(2, 0);
    expect(limiter.tryTake('a', 1000)).toBe(true);
    expect(limiter.tryTake('a', 1000)).toBe(true);
    expect(limiter.tryTake('a', 1000)).toBe(false);
  });
});

describe('retry', () => {
  test('retries under max attempts', () => {
    expect(shouldRetry(1)).toBe(true);
    expect(shouldRetry(5)).toBe(false);
    expect(nextRetryDelayMs(1)).toBeGreaterThan(0);
  });
});
