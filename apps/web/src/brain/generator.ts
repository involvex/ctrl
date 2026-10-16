export type WebGeneratorMode = 'gateway' | 'zen';

export const GENERATOR_MODE_KEY = 'ctrl.web.generator';

export function generatorLabel(mode: WebGeneratorMode): string {
  return mode === 'zen' ? 'Cloud' : 'This PC';
}

export function loadGeneratorMode(): Promise<WebGeneratorMode> {
  try {
    if (typeof localStorage === 'undefined') {
      return Promise.resolve('gateway');
    }
    const raw = localStorage.getItem(GENERATOR_MODE_KEY);
    if (raw === 'zen' || raw === 'gateway') {
      return Promise.resolve(raw);
    }
  } catch {
    // fall through
  }
  return Promise.resolve('gateway');
}

export function saveGeneratorMode(mode: WebGeneratorMode): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GENERATOR_MODE_KEY, mode);
    }
  } catch {
    // best-effort
  }
  return Promise.resolve();
}
