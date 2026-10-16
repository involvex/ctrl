export const CONNECTION_STORAGE_KEY = 'ctrl.web.connection';

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

export function loadSavedConnection(): Promise<SavedConnection | null> {
  try {
    if (typeof localStorage === 'undefined') {
      return Promise.resolve(null);
    }
    const raw = localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (!raw) {
      return Promise.resolve(null);
    }
    return Promise.resolve(parseSavedConnection(raw));
  } catch {
    return Promise.resolve(null);
  }
}

export function saveConnection(value: SavedConnection): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // best-effort
  }
  return Promise.resolve();
}
