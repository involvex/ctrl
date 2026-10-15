import { Platform } from 'react-native';
import {
  deviceCapabilitiesSchema,
  type DeviceCapabilities,
  type InferenceBackend,
  type ThermalState,
} from '@involvex/ctrl-s';

type BatteryModule = {
  BatteryState: {
    UNKNOWN: number;
    UNPLUGGED: number;
    CHARGING: number;
    FULL: number;
  };
  getBatteryLevelAsync: () => Promise<number>;
  getBatteryStateAsync: () => Promise<number>;
  isLowPowerModeEnabledAsync: () => Promise<boolean>;
};

type DeviceModule = {
  isDevice: boolean;
  supportedCpuArchitectures: string[] | null;
  totalMemory: number | null;
  platformApiLevel: number | null;
};

type LitertModule = {
  checkBackendSupport?: (
    backend: InferenceBackend
  ) => Promise<boolean> | boolean;
};

function isArm64(abis: string[]): boolean {
  return abis.some((a) => a.includes('arm64'));
}

async function readBattery(): Promise<{
  batteryLevel: number | null;
  batteryState: DeviceCapabilities['batteryState'];
  lowPowerMode: boolean;
}> {
  try {
    const Battery = (await import('expo-battery')) as BatteryModule;
    const [level, state, lowPowerMode] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
      Battery.isLowPowerModeEnabledAsync(),
    ]);
    const map: Record<number, DeviceCapabilities['batteryState']> = {
      [Battery.BatteryState.UNKNOWN]: 'unknown',
      [Battery.BatteryState.UNPLUGGED]: 'unplugged',
      [Battery.BatteryState.CHARGING]: 'charging',
      [Battery.BatteryState.FULL]: 'full',
    };
    return {
      batteryLevel: Number.isFinite(level) && level >= 0 ? level : null,
      batteryState: map[state] ?? 'unknown',
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

async function readDevice(): Promise<{
  isDevice: boolean;
  abi: string[];
  apiLevel: number | null;
  totalMemoryMb: number | null;
}> {
  try {
    const Device = (await import('expo-device')) as DeviceModule;
    const abi = [...(Device.supportedCpuArchitectures ?? [])].filter(
      (a): a is string => typeof a === 'string'
    );
    const totalMemoryMb =
      typeof Device.totalMemory === 'number' && Device.totalMemory > 0
        ? Device.totalMemory / (1024 * 1024)
        : null;
    return {
      isDevice: Device.isDevice,
      abi,
      apiLevel:
        typeof Device.platformApiLevel === 'number'
          ? Device.platformApiLevel
          : null,
      totalMemoryMb,
    };
  } catch {
    return {
      isDevice: false,
      abi: [],
      apiLevel: null,
      totalMemoryMb: null,
    };
  }
}

async function probeBackends(): Promise<DeviceCapabilities['backends']> {
  const backends = { cpu: true, gpu: false, npu: false };
  if (Platform.OS !== 'android') {
    return backends;
  }
  try {
    const litert = (await import('react-native-litert-lm')) as LitertModule;
    if (typeof litert.checkBackendSupport === 'function') {
      backends.gpu = await litert.checkBackendSupport('gpu');
      backends.npu = await litert.checkBackendSupport('npu');
    }
  } catch {
    // Native module absent in Expo Go / web / incomplete prebuild.
  }
  return backends;
}

async function probeLitertAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    await import('react-native-litert-lm');
    return true;
  } catch {
    return false;
  }
}

/** Best-effort thermal — native PowerManager lands with full LiteRT builds. */
function readThermalState(): ThermalState {
  return 'unknown';
}

export async function probeDeviceCapabilities(): Promise<DeviceCapabilities> {
  const platform =
    Platform.OS === 'android'
      ? 'android'
      : Platform.OS === 'ios'
        ? 'ios'
        : Platform.OS === 'web'
          ? 'web'
          : 'unknown';

  const [device, battery, backends, litertAvailable] = await Promise.all([
    readDevice(),
    readBattery(),
    probeBackends(),
    probeLitertAvailable(),
  ]);

  return deviceCapabilitiesSchema.parse({
    platform,
    isDevice: device.isDevice,
    abi: device.abi,
    isArm64: isArm64(device.abi),
    apiLevel: device.apiLevel,
    totalMemoryMb: device.totalMemoryMb,
    batteryLevel: battery.batteryLevel,
    batteryState: battery.batteryState,
    lowPowerMode: battery.lowPowerMode,
    thermalState: readThermalState(),
    backends,
    litertAvailable,
  });
}
