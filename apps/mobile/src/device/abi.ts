/**
 * Resolve whether the device counts as arm64 for LiteRT policy.
 * Empty ABI on Android → arm64 (this app ships arm64-v8a only).
 * Only fail when the list is non-empty and has no arm64 entry.
 */
export function resolveIsArm64(input: {
  platform: string;
  abi: readonly string[];
  isDevice: boolean;
}): boolean {
  const { platform, abi, isDevice } = input;
  if (abi.some((a) => /arm64|aarch64/i.test(a))) {
    return true;
  }
  if (platform === 'android' && abi.length === 0) {
    return true;
  }
  if (platform === 'ios' && isDevice) {
    return true;
  }
  return false;
}
