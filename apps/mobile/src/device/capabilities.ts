import { Platform } from 'react-native';
import type { DeviceCapabilities, InferenceBackend } from '@involvex/ctrl-s';

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

function detectLitertNative(): boolean {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return false;
  }
  try {
    // Presence of Nitro + LiteRT hybrid objects (dev client / release builds).
    // Expo Go / web: require succeeds for JS but native object creation fails.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NitroModules } = require('react-native-nitro-modules') as {
      NitroModules?: { createHybridObject?: (name: string) => unknown };
    };
    if (!NitroModules?.createHybridObject) {
      return false;
    }
    NitroModules.createHybridObject('LiteRTLM');
    return true;
  } catch {
    return false;
  }
}

/**
 * Live device probe for on-device policy + LiteRT load decisions.
 */
export async function probeDeviceCapabilities(): Promise<DeviceCapabilities> {
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

  const isArm64 =
    abi.some((a) => /arm64|aarch64/i.test(a)) ||
    (Platform.OS === 'ios' && isDevice);

  const platform: DeviceCapabilities['platform'] =
    Platform.OS === 'android'
      ? 'android'
      : Platform.OS === 'ios'
        ? 'ios'
        : Platform.OS === 'web'
          ? 'web'
          : 'unknown';

  return {
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
}

export function backendForPolicy(
  backend: InferenceBackend | null
): 'cpu' | 'gpu' | 'npu' {
  if (backend === 'gpu' || backend === 'npu') {
    return backend;
  }
  return 'cpu';
}
