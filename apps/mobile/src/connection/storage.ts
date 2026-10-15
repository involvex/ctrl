import { parsePairPayload, type PairPayload } from '@involvex/ctrl-s';

export const CONNECTION_STORAGE_KEY = 'ctrl.mobile.connection';

export type SavedConnection = {
  gatewayUrl: string;
  token: string;
};

export function parseSavedConnection(raw: string): SavedConnection | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (!('gatewayUrl' in value) || typeof value.gatewayUrl !== 'string') {
    return null;
  }
  return {
    gatewayUrl: value.gatewayUrl,
    token:
      'token' in value && typeof value.token === 'string' ? value.token : '',
  };
}

export async function loadSavedConnection(): Promise<SavedConnection | null> {
  try {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    const raw = await AsyncStorage.getItem(CONNECTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parseSavedConnection(raw);
  } catch {
    return null;
  }
}

export async function saveConnection(value: SavedConnection): Promise<void> {
  try {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    await AsyncStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort on web/native.
  }
}

export function connectionFromPairPayload(
  payload: PairPayload
): SavedConnection {
  return {
    gatewayUrl: payload.gatewayUrl.replace(/\/$/, ''),
    token: payload.token,
  };
}

export function connectionFromScanData(raw: string): SavedConnection | null {
  const payload = parsePairPayload(raw);
  if (!payload) {
    return null;
  }
  return connectionFromPairPayload(payload);
}
