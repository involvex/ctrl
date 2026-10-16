/** Pure path/URL helpers (no native imports — safe for unit tests). */

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
