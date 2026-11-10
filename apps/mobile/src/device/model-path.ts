/** Pure path/URL helpers (no native imports — safe for unit tests). */

/** Reject empty / tiny / clearly truncated files (any model). */
export const MIN_MODEL_BYTES = 50 * 1024 * 1024;

/**
 * Gemma 4 E2B is ~2.58 GB. Require ≥2 GB before treating a CDN cache hit
 * as complete — a 1 MB threshold let partial files reach native load.
 */
export const MIN_GEMMA_E2B_BYTES = 2 * 1024 * 1024 * 1024;

export function minBytesForSource(pathOrUrl: string): number {
  if (/gemma-4-E2B/i.test(pathOrUrl)) {
    return MIN_GEMMA_E2B_BYTES;
  }
  return MIN_MODEL_BYTES;
}

export function normalizeModelPath(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith('file://')) {
    return decodeURIComponent(trimmed.slice('file://'.length));
  }
  return trimmed;
}

export function isRemoteModelUrl(pathOrUrl: string): boolean {
  return pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('http://');
}

export function describeDownloadError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /unexpected end of stream|Incomplete download|ProtocolException/i.test(
      message
    )
  ) {
    return (
      `${message}\n\n` +
      'Large model download was interrupted (CDN/network). Retry, or import a .litertlm file from storage (download on PC, copy via USB/adb).'
    );
  }
  return message;
}
