import { describe, expect, test } from 'bun:test';
import {
  describeDownloadError,
  isRemoteModelUrl,
  normalizeModelPath,
} from './model-path';

describe('model-path helpers', () => {
  test('normalizeModelPath strips file://', () => {
    expect(normalizeModelPath('file:///data/local/tmp/model.litertlm')).toBe(
      '/data/local/tmp/model.litertlm'
    );
  });

  test('isRemoteModelUrl detects https', () => {
    expect(isRemoteModelUrl('https://example.com/m.litertlm')).toBe(true);
    expect(isRemoteModelUrl('/sdcard/m.litertlm')).toBe(false);
  });

  test('describeDownloadError explains stream cuts', () => {
    const msg = describeDownloadError(
      new Error('Download failed: unexpected end of stream')
    );
    expect(msg).toContain('interrupted');
    expect(msg).toContain('import');
  });
});
