import { createLLM, type LiteRTLMInstance } from 'react-native-litert-lm';

export type LitertBackend = 'cpu' | 'gpu' | 'npu';

type EngineSlot = {
  llm: LiteRTLMInstance | null;
  path: string | null;
  backend: LitertBackend;
  systemPrompt: string;
  loaded: boolean;
  loadPromise: Promise<void> | null;
  generatePromise: Promise<string> | null;
};

/**
 * Process-wide LiteRT engine. Never mount two `useModel` hooks — each creates
 * a native HybridObject that can hold a multi-GB model and OOM the phone.
 */
const slot: EngineSlot = {
  llm: null,
  path: null,
  backend: 'cpu',
  systemPrompt: '',
  loaded: false,
  loadPromise: null,
  generatePromise: null,
};

export function getLitertEnginePath(): string | null {
  return slot.path;
}

export function isLitertEngineLoaded(path?: string): boolean {
  if (!slot.loaded || !slot.llm) {
    return false;
  }
  if (path && slot.path !== path) {
    return false;
  }
  return true;
}

async function disposeCurrent(): Promise<void> {
  const llm = slot.llm;
  slot.llm = null;
  slot.loaded = false;
  slot.path = null;
  slot.loadPromise = null;
  slot.generatePromise = null;
  if (!llm) {
    return;
  }
  try {
    await llm.unload();
  } catch {
    // may already be unloaded
  }
  try {
    llm.close();
  } catch {
    // ignore
  }
}

/**
 * Unload weights and destroy the native HybridObject. Does not delete files.
 */
export async function unloadLitertEngine(): Promise<void> {
  if (slot.loadPromise) {
    try {
      await slot.loadPromise;
    } catch {
      // ignore failed load
    }
  }
  if (slot.generatePromise) {
    try {
      await slot.generatePromise;
    } catch {
      // ignore failed generate
    }
  }
  await disposeCurrent();
}

/**
 * Ensure exactly one loaded engine for `path`. Reloads if path/backend change.
 */
export async function ensureLitertLoaded(options: {
  path: string;
  backend: LitertBackend;
  systemPrompt: string;
}): Promise<void> {
  const { path, backend, systemPrompt } = options;
  if (
    slot.loaded &&
    slot.llm &&
    slot.path === path &&
    slot.backend === backend
  ) {
    return;
  }

  if (slot.loadPromise) {
    await slot.loadPromise;
    if (
      slot.loaded &&
      slot.llm &&
      slot.path === path &&
      slot.backend === backend
    ) {
      return;
    }
  }

  const work = (async () => {
    await disposeCurrent();
    const llm = createLLM({ enableMemoryTracking: true });
    slot.llm = llm;
    slot.path = path;
    slot.backend = backend;
    slot.systemPrompt = systemPrompt;
    try {
      await llm.loadModel(path, {
        backend,
        systemPrompt,
        maxOutputTokens: 512,
        maxContextTokens: 2048,
      });
      slot.loaded = true;
    } catch (err) {
      await disposeCurrent();
      throw err;
    }
  })();

  slot.loadPromise = work;
  try {
    await work;
  } finally {
    if (slot.loadPromise === work) {
      slot.loadPromise = null;
    }
  }
}

/**
 * Generate with the loaded singleton. Caller must `ensureLitertLoaded` first.
 */
export async function generateWithLitert(prompt: string): Promise<string> {
  if (!slot.llm || !slot.loaded) {
    throw new Error('Model not ready — load from Model setup first.');
  }
  if (slot.generatePromise) {
    throw new Error('LiteRT is already generating — wait for the reply.');
  }
  const llm = slot.llm;
  const work = llm.execute([{ type: 'text', text: prompt.trim() }]);
  slot.generatePromise = work;
  try {
    return await work;
  } finally {
    if (slot.generatePromise === work) {
      slot.generatePromise = null;
    }
  }
}
