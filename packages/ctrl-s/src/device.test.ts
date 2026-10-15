import { describe, expect, test } from 'bun:test';
import { evaluateOnDevicePolicy, type DeviceCapabilities } from './device';

const baseCaps: DeviceCapabilities = {
  platform: 'android',
  isDevice: true,
  abi: ['arm64-v8a'],
  isArm64: true,
  apiLevel: 34,
  totalMemoryMb: 6144,
  batteryLevel: 0.8,
  batteryState: 'unplugged',
  lowPowerMode: false,
  thermalState: 'nominal',
  backends: { cpu: true, gpu: false, npu: false },
  litertAvailable: true,
};

const request = {
  modelId: 'GEMMA_4_E2B_IT',
  minMemoryMb: 4096,
  preferredBackend: 'cpu' as const,
};

describe('evaluateOnDevicePolicy', () => {
  test('allows healthy Android arm64 device on CPU', () => {
    const decision = evaluateOnDevicePolicy(baseCaps, request);
    expect(decision.allowed).toBe(true);
    expect(decision.backend).toBe('cpu');
    expect(decision.reasons).toEqual([]);
  });

  test('prefers GPU when requested and available', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, backends: { cpu: true, gpu: true, npu: false } },
      { ...request, preferredBackend: 'gpu' }
    );
    expect(decision.allowed).toBe(true);
    expect(decision.backend).toBe('gpu');
  });

  test('falls back from NPU to GPU to CPU', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, backends: { cpu: true, gpu: true, npu: false } },
      { ...request, preferredBackend: 'npu' }
    );
    expect(decision.backend).toBe('gpu');
  });

  test('allows iOS arm64 when LiteRT is available', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, platform: 'ios', apiLevel: null },
      request
    );
    expect(decision.allowed).toBe(true);
    expect(decision.backend).toBe('cpu');
  });

  test('blocks unsupported platforms', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, platform: 'web' },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('platform'))).toBe(true);
  });

  test('blocks low battery while unplugged', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, batteryLevel: 0.1, batteryState: 'unplugged' },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('battery'))).toBe(true);
  });

  test('warns when battery is under 35% unplugged', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, batteryLevel: 0.3, batteryState: 'unplugged' },
      request
    );
    expect(decision.allowed).toBe(true);
    expect(decision.warnings.some((w) => w.includes('35%'))).toBe(true);
  });

  test('blocks critical thermal state', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, thermalState: 'critical' },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('thermal'))).toBe(true);
  });

  test('warns on fair thermal', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, thermalState: 'fair' },
      request
    );
    expect(decision.allowed).toBe(true);
    expect(decision.warnings.some((w) => w.includes('fair'))).toBe(true);
  });

  test('blocks non-arm64', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, isArm64: false, abi: ['x86_64'] },
      request
    );
    expect(decision.allowed).toBe(false);
  });

  test('blocks low API level', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, apiLevel: 24 },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('API'))).toBe(true);
  });

  test('blocks when LiteRT unavailable', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, litertAvailable: false },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('LiteRT'))).toBe(true);
  });

  test('blocks low RAM', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, totalMemoryMb: 2048 },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('RAM'))).toBe(true);
  });

  test('blocks low-power mode', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, lowPowerMode: true },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('low-power'))).toBe(true);
  });

  test('blocks when no backends available', () => {
    const decision = evaluateOnDevicePolicy(
      { ...baseCaps, backends: { cpu: false, gpu: false, npu: false } },
      request
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('backend'))).toBe(true);
  });
});
