import AsyncStorage from '@react-native-async-storage/async-storage';

export type InferenceMode = 'gateway' | 'litert';

export const INFERENCE_MODE_KEY = 'ctrl.mobile.inferenceMode';

export async function loadInferenceMode(): Promise<InferenceMode> {
  try {
    const saved = await AsyncStorage.getItem(INFERENCE_MODE_KEY);
    if (saved === 'litert' || saved === 'gateway') {
      return saved;
    }
  } catch {
    // fall through
  }
  return 'gateway';
}

export async function saveInferenceMode(mode: InferenceMode): Promise<void> {
  try {
    await AsyncStorage.setItem(INFERENCE_MODE_KEY, mode);
  } catch {
    // best-effort
  }
}
