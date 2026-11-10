import { describe, expect, test } from 'bun:test';
import {
  MIN_GEMMA_E2B_BYTES,
  MIN_MODEL_BYTES,
  minBytesForSource,
} from './model-path';

describe('model-size gates', () => {
  test('gemma E2B paths require ~2 GB', () => {
    expect(
      minBytesForSource(
        'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm'
      )
    ).toBe(MIN_GEMMA_E2B_BYTES);
    expect(minBytesForSource('/data/models/gemma-4-E2B-it.litertlm')).toBe(
      MIN_GEMMA_E2B_BYTES
    );
  });

  test('other models use 50 MB floor', () => {
    expect(minBytesForSource('/sdcard/custom.litertlm')).toBe(MIN_MODEL_BYTES);
  });
});
