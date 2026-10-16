import { describe, expect, test } from 'bun:test';
import { resolveIsArm64 } from './abi';

describe('resolveIsArm64', () => {
  test('empty ABI on Android counts as arm64', () => {
    expect(
      resolveIsArm64({ platform: 'android', abi: [], isDevice: true })
    ).toBe(true);
  });

  test('explicit arm64-v8a allowed', () => {
    expect(
      resolveIsArm64({
        platform: 'android',
        abi: ['arm64-v8a'],
        isDevice: true,
      })
    ).toBe(true);
  });

  test('explicit x86_64 blocked', () => {
    expect(
      resolveIsArm64({
        platform: 'android',
        abi: ['x86_64'],
        isDevice: false,
      })
    ).toBe(false);
  });

  test('iOS device without ABI list allowed', () => {
    expect(resolveIsArm64({ platform: 'ios', abi: [], isDevice: true })).toBe(
      true
    );
  });
});
