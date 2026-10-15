import Constants from 'expo-constants';

const GATEWAY_PORT = 7331;

function hostFromUri(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const host = raw.split(':')[0]?.trim();
  if (!host) {
    return null;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return null;
  }
  return host;
}

/**
 * Prefer the Metro / Expo Go host IP (e.g. 192.168.178.69) so a physical device
 * points at the machine running the gateway — never default to loopback.
 */
export function guessDevHostIp(): string | null {
  const fromConfig = hostFromUri(Constants.expoConfig?.hostUri ?? null);
  if (fromConfig) {
    return fromConfig;
  }

  const go = Constants.expoGoConfig as { debuggerHost?: string } | null;
  const fromGo = hostFromUri(go?.debuggerHost ?? null);
  if (fromGo) {
    return fromGo;
  }

  const legacy = Constants as {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
  };
  return (
    hostFromUri(legacy.manifest?.debuggerHost) ??
    hostFromUri(legacy.manifest2?.extra?.expoGo?.debuggerHost)
  );
}

export function defaultGatewayUrl(): string {
  const host = guessDevHostIp();
  if (host) {
    return `http://${host}:${GATEWAY_PORT}`;
  }
  // Last resort: still avoid advertising loopback as "the" answer on device.
  return `http://192.168.0.1:${GATEWAY_PORT}`;
}
