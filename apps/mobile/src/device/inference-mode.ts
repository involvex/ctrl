import AsyncStorage from '@react-native-async-storage/async-storage';

/** Who answers in the single chat UI. */
export type GeneratorMode = 'litert' | 'gateway' | 'zen';

/** @deprecated Use GeneratorMode */
export type InferenceMode = GeneratorMode;

export const GENERATOR_MODE_KEY = 'ctrl.mobile.generator';
export const INFERENCE_MODE_KEY = 'ctrl.mobile.inferenceMode';

function parseMode(raw: string | null): GeneratorMode | null {
  if (raw === 'litert' || raw === 'gateway' || raw === 'zen') {
    return raw;
  }
  return null;
}

export async function loadGeneratorMode(): Promise<GeneratorMode> {
  try {
    const primary = parseMode(await AsyncStorage.getItem(GENERATOR_MODE_KEY));
    if (primary) {
      return primary;
    }
    const legacy = parseMode(await AsyncStorage.getItem(INFERENCE_MODE_KEY));
    if (legacy) {
      return legacy;
    }
  } catch {
    // fall through
  }
  return 'litert';
}

export async function saveGeneratorMode(mode: GeneratorMode): Promise<void> {
  try {
    await AsyncStorage.setItem(GENERATOR_MODE_KEY, mode);
    // Keep legacy key for older screens until fully migrated.
    await AsyncStorage.setItem(
      INFERENCE_MODE_KEY,
      mode === 'zen' ? 'gateway' : mode
    );
  } catch {
    // best-effort
  }
}

export const loadInferenceMode = loadGeneratorMode;
export const saveInferenceMode = saveGeneratorMode;

export function generatorLabel(mode: GeneratorMode): string {
  if (mode === 'litert') {
    return 'On this phone';
  }
  if (mode === 'zen') {
    return 'Cloud';
  }
  return 'This PC';
}
