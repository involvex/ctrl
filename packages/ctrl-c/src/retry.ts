const MAX_ATTEMPTS = 5;

/** Exponential backoff with jitter (ms). */
export function nextRetryDelayMs(attempts: number): number {
  const base = Math.min(60_000, 500 * 2 ** Math.max(0, attempts - 1));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export function shouldRetry(attempts: number): boolean {
  return attempts < MAX_ATTEMPTS;
}

export { MAX_ATTEMPTS };
