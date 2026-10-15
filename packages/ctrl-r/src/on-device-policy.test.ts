import { describe, expect, test } from 'bun:test';
import type { DeviceCapabilities } from '@involvex/ctrl-s';
import { evaluateOnDevicePolicy } from './on-device-policy';

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

describe('evaluateOnDevicePolicy (ctrl-r re-export)', () => {
  test('allows healthy device', () => {
    const decision = evaluateOnDevicePolicy(baseCaps, {
      modelId: 'GEMMA_4_E2B_IT',
      minMemoryMb: 4096,
      preferredBackend: 'cpu',
    });
    expect(decision.allowed).toBe(true);
  });
});
