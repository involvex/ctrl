import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEMMA_4_E2B_IT, ModelRegistry } from 'react-native-litert-lm';
import { isRemoteModelUrl } from './model-path';

export {
  describeDownloadError,
  isRemoteModelUrl,
  normalizeModelPath,
} from './model-path';

export const DEFAULT_MODEL_URL = GEMMA_4_E2B_IT;
export const MODEL_SOURCE_KEY = 'ctrl.mobile.litert.modelSource';

export async function loadSavedModelSource(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(MODEL_SOURCE_KEY);
    if (saved && saved.length > 0) {
      if (!isRemoteModelUrl(saved)) {
        const size = ModelRegistry.getFileSizeBytes(saved);
        if (size > 0) {
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

/**
 * Download with retries. HuggingFace CDN often closes mid-transfer
 * (`unexpected end of stream`); clear partial cache and try again.
 */
export async function downloadModelWithRetry(
  url: string,
  options: {
    attempts?: number;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<string> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (ModelRegistry.isCached(url)) {
        const path = ModelRegistry.getFilePath(url);
        const size = ModelRegistry.getFileSizeBytes(path);
        if (size > 1024 * 1024) {
          options.onProgress?.(1);
          return path;
        }
        ModelRegistry.deleteFile(url);
      }
      return await ModelRegistry.resolveModel(url, {
        onProgress: options.onProgress,
      });
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
