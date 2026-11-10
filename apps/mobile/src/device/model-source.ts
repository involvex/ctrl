import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEMMA_4_E2B_IT, ModelRegistry } from 'react-native-litert-lm';
import { isRemoteModelUrl, minBytesForSource } from './model-path';
import { readModelFileBytes } from './model-size';

export {
  describeDownloadError,
  isRemoteModelUrl,
  normalizeModelPath,
} from './model-path';

export const DEFAULT_MODEL_URL = GEMMA_4_E2B_IT;
export const MODEL_SOURCE_KEY = 'ctrl.mobile.litert.modelSource';
export const DOWNLOAD_PROGRESS_KEY = 'ctrl.mobile.litert.downloadProgress';

export async function loadSavedModelSource(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(MODEL_SOURCE_KEY);
    if (saved && saved.length > 0) {
      if (!isRemoteModelUrl(saved)) {
        const size = readModelFileBytes(saved);
        if (size >= minBytesForSource(saved)) {
          return saved;
        }
      } else {
        return saved;
      }
    }
  } catch {
    // fall through
  }
  return DEFAULT_MODEL_URL;
}

export async function saveModelSource(pathOrUrl: string): Promise<void> {
  try {
    await AsyncStorage.setItem(MODEL_SOURCE_KEY, pathOrUrl);
  } catch {
    // best-effort
  }
}

export async function saveDownloadProgress(progress: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DOWNLOAD_PROGRESS_KEY, String(progress));
  } catch {
    // best-effort
  }
}

export async function loadDownloadProgress(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOAD_PROGRESS_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function clearDownloadProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DOWNLOAD_PROGRESS_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Download with retries. HuggingFace CDN often closes mid-transfer
 * (`unexpected end of stream`); clear partial cache and try again.
 * Note: retries are full re-downloads (no HTTP Range resume yet).
 */
export async function downloadModelWithRetry(
  url: string,
  options: {
    attempts?: number;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<string> {
  const attempts = options.attempts ?? 3;
  const minBytes = minBytesForSource(url);
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (ModelRegistry.isCached(url)) {
        const path = ModelRegistry.getFilePath(url);
        const size = readModelFileBytes(path);
        if (size >= minBytes) {
          options.onProgress?.(1);
          return path;
        }
        ModelRegistry.deleteFile(url);
      }
      const path = await ModelRegistry.resolveModel(url, {
        onProgress: options.onProgress,
      });
      const size = readModelFileBytes(path);
      if (size < minBytes) {
        try {
          ModelRegistry.deleteFile(url);
        } catch {
          // ignore
        }
        throw new Error(
          `Download incomplete (${(size / (1024 * 1024)).toFixed(0)} MB, need ≥${(minBytes / (1024 * 1024)).toFixed(0)} MB)`
        );
      }
      return path;
    } catch (err) {
      lastError = err;
      try {
        ModelRegistry.deleteFile(url);
      } catch {
        // ignore cleanup errors
      }
      if (i === attempts) {
        break;
      }
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(
    typeof lastError === 'string' ? lastError : 'download failed'
  );
}
