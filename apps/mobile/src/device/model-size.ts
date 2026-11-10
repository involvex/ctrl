import { ModelRegistry } from 'react-native-litert-lm';
import { isRemoteModelUrl, minBytesForSource } from './model-path';

export {
  MIN_GEMMA_E2B_BYTES,
  MIN_MODEL_BYTES,
  minBytesForSource,
} from './model-path';

export function readModelFileBytes(pathOrUrl: string): number {
  if (isRemoteModelUrl(pathOrUrl)) {
    return 0;
  }
  try {
    return ModelRegistry.getFileSizeBytes(pathOrUrl);
  } catch {
    return 0;
  }
}

export function assertModelFileUsable(pathOrUrl: string): number {
  if (isRemoteModelUrl(pathOrUrl)) {
    throw new Error(
      'Model not downloaded. Open Model setup to download or import a .litertlm file.'
    );
  }
  const size = readModelFileBytes(pathOrUrl);
  const min = minBytesForSource(pathOrUrl);
  if (size <= 0) {
    throw new Error(
      `Model file not readable (${pathOrUrl}). Re-import from Model setup.`
    );
  }
  if (size < min) {
    throw new Error(
      `Model file looks incomplete (${(size / (1024 * 1024)).toFixed(0)} MB, need ≥${(min / (1024 * 1024)).toFixed(0)} MB). Delete cache and re-download or re-import.`
    );
  }
  return size;
}
