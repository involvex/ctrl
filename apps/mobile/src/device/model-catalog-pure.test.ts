import { describe, expect, test } from 'bun:test';
import {
  forgetCatalogEntry,
  labelFromModelPath,
  mergeSeedPaths,
  nextActiveAfterForget,
  parseCatalogJson,
  policyRequestForSource,
  pruneCatalogEntries,
  upsertCatalogEntry,
  type ModelCatalogEntry,
} from './model-catalog-pure';
import { MIN_GEMMA_E2B_BYTES, MIN_MODEL_BYTES } from './model-path';

const smallLocal: ModelCatalogEntry = {
  path: '/sdcard/custom.litertlm',
  label: 'custom.litertlm',
  bytes: MIN_MODEL_BYTES,
  origin: 'import',
};

const gemmaLocal: ModelCatalogEntry = {
  path: '/data/models/gemma-4-E2B-it.litertlm',
  label: 'gemma-4-E2B-it.litertlm',
  bytes: MIN_GEMMA_E2B_BYTES,
  origin: 'download',
};

describe('model-catalog-pure', () => {
  test('labelFromModelPath uses basename', () => {
    expect(labelFromModelPath('/a/b/c.litertlm')).toBe('c.litertlm');
    expect(labelFromModelPath('file:///data/x.litertlm')).toBe('x.litertlm');
  });

  test('policyRequestForSource keeps E2B floor', () => {
    const req = policyRequestForSource(gemmaLocal.path, gemmaLocal.bytes);
    expect(req.modelId).toBe('GEMMA_4_E2B_IT');
    expect(req.minMemoryMb).toBe(4096);
  });

  test('policyRequestForSource uses lower floor for other models', () => {
    const req = policyRequestForSource(smallLocal.path, smallLocal.bytes);
    expect(req.modelId).toBe('custom');
    expect(req.minMemoryMb).toBe(2048);
  });

  test('parseCatalogJson ignores garbage', () => {
    expect(parseCatalogJson(null)).toEqual([]);
    expect(parseCatalogJson('not-json')).toEqual([]);
    expect(parseCatalogJson('{}')).toEqual([]);
  });

  test('upsertCatalogEntry replaces by path', () => {
    const once = upsertCatalogEntry([], smallLocal);
    expect(once).toHaveLength(1);
    const twice = upsertCatalogEntry(once, {
      ...smallLocal,
      bytes: MIN_MODEL_BYTES + 10,
      origin: 'download',
    });
    expect(twice).toHaveLength(1);
    expect(twice[0]?.bytes).toBe(MIN_MODEL_BYTES + 10);
    expect(twice[0]?.origin).toBe('download');
  });

  test('upsertCatalogEntry drops incomplete sizes', () => {
    const kept = upsertCatalogEntry([gemmaLocal], {
      path: smallLocal.path,
      label: smallLocal.label,
      bytes: 1024,
      origin: 'import',
    });
    expect(kept).toEqual([gemmaLocal]);
  });

  test('forgetCatalogEntry removes only the matching path', () => {
    const both = [gemmaLocal, smallLocal];
    expect(forgetCatalogEntry(both, gemmaLocal.path)).toEqual([smallLocal]);
  });

  test('pruneCatalogEntries drops missing and incomplete', () => {
    const sizes = new Map<string, number>([
      [gemmaLocal.path, MIN_GEMMA_E2B_BYTES],
      [smallLocal.path, 0],
    ]);
    expect(pruneCatalogEntries([gemmaLocal, smallLocal], sizes)).toEqual([
      gemmaLocal,
    ]);
  });

  test('nextActiveAfterForget falls back to catalog then default URL', () => {
    const both = [gemmaLocal, smallLocal];
    expect(
      nextActiveAfterForget(
        both,
        gemmaLocal.path,
        gemmaLocal.path,
        'https://default'
      )
    ).toBe(smallLocal.path);
    expect(
      nextActiveAfterForget(
        [gemmaLocal],
        gemmaLocal.path,
        gemmaLocal.path,
        'https://default'
      )
    ).toBe('https://default');
    expect(
      nextActiveAfterForget(
        both,
        gemmaLocal.path,
        smallLocal.path,
        'https://default'
      )
    ).toBe(smallLocal.path);
  });

  test('mergeSeedPaths upserts readable seeds', () => {
    const merged = mergeSeedPaths(
      [],
      [
        {
          path: smallLocal.path,
          bytes: MIN_MODEL_BYTES,
          origin: 'import',
        },
        {
          path: '/tmp/tiny.litertlm',
          bytes: 1,
          origin: 'import',
        },
      ]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.path).toBe(smallLocal.path);
  });
});
