import { describe, expect, test } from 'bun:test';
import { listHfModelCatalog, listModels } from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: models', () => {
  test('GET /api/v1/models returns mock provider shape', async () => {
    const result = await listModels(baseUrl());
    expect(result.provider).toBe('mock');
    expect(Array.isArray(result.items)).toBe(true);
  });

  test('GET /api/v1/models/catalog/hf returns items', async () => {
    const catalog = await listHfModelCatalog(baseUrl());
    expect(Array.isArray(catalog.items)).toBe(true);
    expect(catalog.items.length).toBeGreaterThan(0);
    expect(typeof catalog.items[0]?.id).toBe('string');
    const first = catalog.items[0]!;
    expect(Array.isArray(first.quantizations)).toBe(true);
    expect((first.quantizations?.length ?? 0) > 1).toBe(true);
    expect(first.quantizations?.[0]?.downloadUrl).toContain('huggingface.co');
    expect(first.defaultQuant).toBeTruthy();
  });
});
