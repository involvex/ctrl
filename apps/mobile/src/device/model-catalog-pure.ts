/** Pure catalog helpers (no AsyncStorage / native — safe for unit tests). */

import { minBytesForSource, normalizeModelPath } from './model-path';

export type ModelCatalogOrigin = 'download' | 'import';

export type ModelCatalogEntry = {
  path: string;
  label: string;
  bytes: number;
  origin: ModelCatalogOrigin;
};

export const MODEL_CATALOG_KEY = 'ctrl.mobile.litert.catalog';

/** Basename for UI labels (path or URL). */
export function labelFromModelPath(pathOrUrl: string): string {
  const normalized = normalizeModelPath(pathOrUrl);
  const parts = normalized.split(/[/\\]/);
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : normalized;
}

export function isGemmaE2BSource(pathOrUrl: string): boolean {
  return /gemma-4-E2B/i.test(pathOrUrl);
}

/**
 * Policy request for on-device load. Gemma E2B keeps the 4 GB RAM floor;
 * other .litertlm files use a lower floor (2 GB, or size-derived capped).
 */
export function policyRequestForSource(
  pathOrUrl: string,
  bytes?: number
): {
  modelId: string;
  minMemoryMb: number;
  preferredBackend: 'cpu';
} {
  if (isGemmaE2BSource(pathOrUrl)) {
    return {
      modelId: 'GEMMA_4_E2B_IT',
      minMemoryMb: 4096,
      preferredBackend: 'cpu',
    };
  }
  const label = labelFromModelPath(pathOrUrl);
  const modelId = label.replace(/\.litertlm$/i, '') || 'custom-litertlm';
  let minMemoryMb = 2048;
  if (typeof bytes === 'number' && bytes > 0) {
    // Rough: weights + KV headroom ≈ file MB + 512, capped 4096.
    const derived = Math.ceil(bytes / (1024 * 1024)) + 512;
    minMemoryMb = Math.min(4096, Math.max(2048, derived));
  }
  return {
    modelId,
    minMemoryMb,
    preferredBackend: 'cpu',
  };
}

export function parseCatalogJson(raw: string | null): ModelCatalogEntry[] {
  if (!raw || raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: ModelCatalogEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const pathValue = Reflect.get(item, 'path');
      if (typeof pathValue !== 'string' || pathValue.length === 0) {
        continue;
      }
      const originValue = Reflect.get(item, 'origin');
      const origin: ModelCatalogOrigin =
        originValue === 'download' || originValue === 'import'
          ? originValue
          : 'import';
      const bytesValue = Reflect.get(item, 'bytes');
      const bytes =
        typeof bytesValue === 'number' && bytesValue >= 0 ? bytesValue : 0;
      const labelValue = Reflect.get(item, 'label');
      const label =
        typeof labelValue === 'string' && labelValue.length > 0
          ? labelValue
          : labelFromModelPath(pathValue);
      out.push({
        path: normalizeModelPath(pathValue),
        label,
        bytes,
        origin,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Upsert by normalized path. Drops entries that fail the size gate when
 * `readableBytes` is provided for that path (caller supplies live sizes).
 */
export function upsertCatalogEntry(
  entries: ModelCatalogEntry[],
  next: ModelCatalogEntry
): ModelCatalogEntry[] {
  const path = normalizeModelPath(next.path);
  const min = minBytesForSource(path);
  if (next.bytes > 0 && next.bytes < min) {
    return entries.filter((e) => normalizeModelPath(e.path) !== path);
  }
  const entry: ModelCatalogEntry = {
    path,
    label: next.label || labelFromModelPath(path),
    bytes: next.bytes,
    origin: next.origin,
  };
  const without = entries.filter((e) => normalizeModelPath(e.path) !== path);
  return [...without, entry];
}

/** Remove path from catalog (does not delete files). */
export function forgetCatalogEntry(
  entries: ModelCatalogEntry[],
  pathOrUrl: string
): ModelCatalogEntry[] {
  const path = normalizeModelPath(pathOrUrl);
  return entries.filter((e) => normalizeModelPath(e.path) !== path);
}

/**
 * Drop entries whose live size is missing/zero or below the size gate.
 * `sizes` maps normalized path → bytes (0 = missing/unreadable).
 */
export function pruneCatalogEntries(
  entries: ModelCatalogEntry[],
  sizes: Map<string, number>
): ModelCatalogEntry[] {
  const out: ModelCatalogEntry[] = [];
  for (const entry of entries) {
    const path = normalizeModelPath(entry.path);
    const size = sizes.get(path) ?? 0;
    if (size <= 0) {
      continue;
    }
    if (size < minBytesForSource(path)) {
      continue;
    }
    out.push({
      ...entry,
      path,
      bytes: size,
      label: entry.label || labelFromModelPath(path),
    });
  }
  return out;
}

/**
 * After forgetting the active path, pick another local catalog entry or
 * fall back to `defaultUrl`.
 */
export function nextActiveAfterForget(
  entries: ModelCatalogEntry[],
  forgottenPath: string,
  previousActive: string,
  defaultUrl: string
): string {
  const forgotten = normalizeModelPath(forgottenPath);
  const prev = normalizeModelPath(previousActive);
  if (prev !== forgotten) {
    return previousActive;
  }
  const remaining = forgetCatalogEntry(entries, forgotten);
  const first = remaining[0];
  if (first) {
    return first.path;
  }
  return defaultUrl;
}

/** Merge seed paths (docs dir / cached download) into catalog. */
export function mergeSeedPaths(
  entries: ModelCatalogEntry[],
  seeds: Array<{ path: string; bytes: number; origin: ModelCatalogOrigin }>
): ModelCatalogEntry[] {
  let next = entries;
  for (const seed of seeds) {
    if (seed.bytes <= 0) {
      continue;
    }
    if (seed.bytes < minBytesForSource(seed.path)) {
      continue;
    }
    next = upsertCatalogEntry(next, {
      path: seed.path,
      label: labelFromModelPath(seed.path),
      bytes: seed.bytes,
      origin: seed.origin,
    });
  }
  return next;
}
