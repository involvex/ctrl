import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ModelRegistry } from 'react-native-litert-lm';
import { normalizeModelPath } from './model-path';
import { saveModelSource } from './model-source';

export type ImportModelResult =
  { ok: true; path: string; bytes: number } | { ok: false; error: string };

/**
 * Pick a .litertlm without copying the whole file into cache twice.
 * Prefer the picker URI when ModelRegistry can read it; otherwise copy
 * into documentDirectory via FileSystem (streaming, not JS memory).
 */
export async function importLitertModelFromPicker(): Promise<ImportModelResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/octet-stream', 'application/x-litertlm', '*/*'],
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    return { ok: false, error: 'Import cancelled.' };
  }

  const asset = result.assets[0];
  const name = (asset.name ?? asset.uri).toLowerCase();
  if (!name.includes('.litertlm') && !name.endsWith('.litertlm')) {
    return {
      ok: false,
      error: 'Pick a .litertlm model file (e.g. gemma-4-E2B-it.litertlm).',
    };
  }

  let localPath = normalizeModelPath(asset.uri);
  let size = 0;
  try {
    size = ModelRegistry.getFileSizeBytes(localPath);
  } catch {
    size = 0;
  }

  if (size <= 0) {
    const docs = FileSystem.documentDirectory;
    if (!docs) {
      return {
        ok: false,
        error:
          'App storage unavailable. Re-import after granting storage access.',
      };
    }
    const safeName = (asset.name ?? 'model.litertlm').replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const dest = `${docs}models/${safeName}`;
    await FileSystem.makeDirectoryAsync(`${docs}models`, {
      intermediates: true,
    }).catch(() => {
      // exists
    });
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: dest });
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `Copy failed: ${err.message}`
            : 'Copy into app storage failed (file may be too large).',
      };
    }
    localPath = normalizeModelPath(dest);
    try {
      size = ModelRegistry.getFileSizeBytes(localPath);
    } catch {
      size = 0;
    }
    if (size <= 0) {
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists && 'size' in info && typeof info.size === 'number') {
        size = info.size;
      }
    }
  }

  if (size <= 0) {
    return {
      ok: false,
      error: `Imported path not readable (${localPath}). Re-import or copy via USB/adb.`,
    };
  }

  await saveModelSource(localPath);
  return { ok: true, path: localPath, bytes: size };
}
