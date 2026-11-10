import { Platform } from 'react-native';
import type { DeviceCapabilities, InferenceBackend } from '@involvex/ctrl-s';
import { resolveIsArm64 } from './abi';

let litertAvailableCache: boolean | null = null;
let capsCache: { at: number; value: DeviceCapabilities } | null = null;
const CAPS_TTL_MS = 30_000;

async function readBattery(): Promise<{
  batteryLevel: number | null;
  batteryState: DeviceCapabilities['batteryState'];
  lowPowerMode: boolean;
}> {
  try {
    const Battery = await import('expo-battery');
    const [level, state, lowPowerMode] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
      Battery.isLowPowerModeEnabledAsync(),
    ]);
    const mapped: DeviceCapabilities['batteryState'] =
      state === Battery.BatteryState.CHARGING
        ? 'charging'
        : state === Battery.BatteryState.FULL
          ? 'full'
          : state === Battery.BatteryState.UNPLUGGED
            ? 'unplugged'
            : 'unknown';
    return {
      batteryLevel: level >= 0 ? level : null,
      batteryState: mapped,
      lowPowerMode,
    };
  } catch {
    return {
      batteryLevel: null,
      batteryState: 'unknown',
      lowPowerMode: false,
    };
  }
}

/**
 * Detect LiteRT without leaking HybridObjects on every probe.
 * Creating LiteRTLM registers a native engine; we cache the first result.
 */
function detectLitertNative(): boolean {
  if (litertAvailableCache !== null) {
    return litertAvailableCache;
  }
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    litertAvailableCache = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NitroModules } = require('react-native-nitro-modules') as {
      NitroModules?: {
        createHybridObject?: (name: string) => {
          close?: () => void;
        };
      };
    };
    if (!NitroModules?.createHybridObject) {
      litertAvailableCache = false;
      return false;
    }
    const probe = NitroModules.createHybridObject('LiteRTLM');
    try {
      probe.close?.();
    } catch {
      // ignore
    }
    litertAvailableCache = true;
    return true;
  } catch {
    litertAvailableCache = false;
    return false;
  }
}

/**
 * Live device probe for on-device policy + LiteRT load decisions.
 * Results are TTL-cached so chat generate does not spam native probes.
 */
export async function probeDeviceCapabilities(
  options: { force?: boolean } = {}
): Promise<DeviceCapabilities> {
  if (!options.force && capsCache && Date.now() - capsCache.at < CAPS_TTL_MS) {
    return capsCache.value;
  }

  const battery = await readBattery();
  let abi: string[] = [];
  let apiLevel: number | null = null;
  let totalMemoryMb: number | null = null;
  let isDevice = Platform.OS !== 'web';

  try {
    const Device = await import('expo-device');
    abi = Device.supportedCpuArchitectures ?? [];
    apiLevel =
      typeof Device.platformApiLevel === 'number'
        ? Device.platformApiLevel
        : null;
    totalMemoryMb =
      typeof Device.totalMemory === 'number'
        ? Math.round(Device.totalMemory / (1024 * 1024))
        : null;
    isDevice = Device.isDevice;
  } catch {
    // keep defaults
  }

  const platform: DeviceCapabilities['platform'] =
    Platform.OS === 'android'
      ? 'android'
      : Platform.OS === 'ios'
        ? 'ios'
        : Platform.OS === 'web'
          ? 'web'
          : 'unknown';

  const isArm64 = resolveIsArm64({ platform, abi, isDevice });

  const value: DeviceCapabilities = {
    platform,
    isDevice,
    abi,
    isArm64,
    apiLevel,
    totalMemoryMb,
    batteryLevel: battery.batteryLevel,
    batteryState: battery.batteryState,
    lowPowerMode: battery.lowPowerMode,
    thermalState: 'unknown',
    backends: {
      cpu: true,
      gpu: Platform.OS === 'ios' || Platform.OS === 'android',
      npu: Platform.OS === 'android',
    },
    litertAvailable: detectLitertNative(),
  };
  capsCache = { at: Date.now(), value };
  return value;
}

export function backendForPolicy(
  backend: InferenceBackend | null
): 'cpu' | 'gpu' | 'npu' {
  if (backend === 'gpu' || backend === 'npu') {
    return backend;
  }
  return 'cpu';
}
