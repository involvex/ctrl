import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { ModelRegistry } from 'react-native-litert-lm';
import {
  forgetCatalogEntry,
  labelFromModelPath,
  mergeSeedPaths,
  MODEL_CATALOG_KEY,
  nextActiveAfterForget,
  parseCatalogJson,
  pruneCatalogEntries,
  upsertCatalogEntry,
  type ModelCatalogEntry,
  type ModelCatalogOrigin,
} from './model-catalog-pure';
import { normalizeModelPath } from './model-path';
import { readModelFileBytes } from './model-size';
import {
  DEFAULT_MODEL_URL,
  isRemoteModelUrl,
  saveModelSource,
} from './model-source';

export type { ModelCatalogEntry, ModelCatalogOrigin };
export {
  labelFromModelPath,
  MODEL_CATALOG_KEY,
  policyRequestForSource,
} from './model-catalog-pure';

async function persistCatalog(entries: ModelCatalogEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MODEL_CATALOG_KEY, JSON.stringify(entries));
  } catch {
    // best-effort
  }
}

async function readRawCatalog(): Promise<ModelCatalogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MODEL_CATALOG_KEY);
    return parseCatalogJson(raw);
  } catch {
    return [];
  }
}

function sizeMapFor(entries: ModelCatalogEntry[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const entry of entries) {
    const path = normalizeModelPath(entry.path);
    if (isRemoteModelUrl(path)) {
      sizes.set(path, 0);
      continue;
    }
    sizes.set(path, readModelFileBytes(path));
  }
  return sizes;
}

/**
 * Load catalog, prune missing/incomplete files, optionally seed from
 * documentDirectory/models and the default Gemma download cache.
 */
export async function loadModelCatalog(options?: {
  seed?: boolean;
}): Promise<ModelCatalogEntry[]> {
  let entries = await readRawCatalog();
  entries = pruneCatalogEntries(entries, sizeMapFor(entries));

  if (options?.seed !== false) {
    const seeds = await collectSeedPaths();
    entries = mergeSeedPaths(entries, seeds);
    entries = pruneCatalogEntries(entries, sizeMapFor(entries));
  }

  await persistCatalog(entries);
  return entries;
}

async function collectSeedPaths(): Promise<
  Array<{ path: string; bytes: number; origin: ModelCatalogOrigin }>
> {
  const seeds: Array<{
    path: string;
    bytes: number;
    origin: ModelCatalogOrigin;
  }> = [];

  const docs = FileSystem.documentDirectory;
  if (docs) {
    const modelsDir = `${docs}models`;
    try {
      const listing = await FileSystem.readDirectoryAsync(modelsDir);
      for (const name of listing) {
        if (!name.toLowerCase().endsWith('.litertlm')) {
          continue;
        }
        const path = normalizeModelPath(`${modelsDir}/${name}`);
        const bytes = readModelFileBytes(path);
        if (bytes > 0) {
          seeds.push({ path, bytes, origin: 'import' });
        }
      }
    } catch {
      // dir missing
    }
  }

  try {
    if (ModelRegistry.isCached(DEFAULT_MODEL_URL)) {
      const path = normalizeModelPath(
        ModelRegistry.getFilePath(DEFAULT_MODEL_URL)
      );
      const bytes = readModelFileBytes(path);
      if (bytes > 0) {
        seeds.push({ path, bytes, origin: 'download' });
      }
    }
  } catch {
    // native unavailable
  }

  return seeds;
}

/** Upsert a local path into the catalog and persist. */
export async function upsertModelCatalogEntry(input: {
  path: string;
  bytes: number;
  origin: ModelCatalogOrigin;
  label?: string;
}): Promise<ModelCatalogEntry[]> {
  const entries = await loadModelCatalog({ seed: false });
  const next = upsertCatalogEntry(entries, {
    path: input.path,
    label: input.label ?? labelFromModelPath(input.path),
    bytes: input.bytes,
    origin: input.origin,
  });
  await persistCatalog(next);
  return next;
}

/**
 * Remove from catalog only (keeps files). If the forgotten path was active,
 * switches active source to another catalog entry or DEFAULT_MODEL_URL.
 */
export async function forgetModelCatalogEntry(
  pathOrUrl: string,
  activePath: string
): Promise<{ entries: ModelCatalogEntry[]; active: string }> {
  const entries = await loadModelCatalog({ seed: false });
  const nextActive = nextActiveAfterForget(
    entries,
    pathOrUrl,
    activePath,
    DEFAULT_MODEL_URL
  );
  const next = forgetCatalogEntry(entries, pathOrUrl);
  await persistCatalog(next);
  if (normalizeModelPath(nextActive) !== normalizeModelPath(activePath)) {
    await saveModelSource(nextActive);
  }
  return { entries: next, active: nextActive };
}

/**
 * Record a usable local model as active + catalog entry.
 */
export async function registerLocalModel(input: {
  path: string;
  bytes: number;
  origin: ModelCatalogOrigin;
}): Promise<void> {
  await upsertModelCatalogEntry(input);
  await saveModelSource(normalizeModelPath(input.path));
}
