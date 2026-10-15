declare module 'expo-battery' {
  export enum BatteryState {
    UNKNOWN = 0,
    UNPLUGGED = 1,
    CHARGING = 2,
    FULL = 3,
  }
  export function getBatteryLevelAsync(): Promise<number>;
  export function getBatteryStateAsync(): Promise<BatteryState>;
  export function isLowPowerModeEnabledAsync(): Promise<boolean>;
}

declare module 'expo-device' {
  export const isDevice: boolean;
  export const supportedCpuArchitectures: string[] | null;
  export const platformApiLevel: number | null;
  export const totalMemory: number | null;
}

/** Real types come from the package; keep this empty so module resolution works. */
declare module 'react-native-nitro-modules' {
  export const NitroModules: {
    createHybridObject: (name: string) => unknown;
  };
}
