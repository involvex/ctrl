import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const LLAMA_MODEL_STATE_FILE = 'local-llama-model.json';

export function llamaModelStatePath(): string {
  return path.join(app.getPath('userData'), LLAMA_MODEL_STATE_FILE);
}

export function modelsDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

export function loadLlamaModelPath(): string | null {
  try {
    const raw = readFileSync(llamaModelStatePath(), 'utf8');
    const parsed = z
      .object({ path: z.string().min(1) })
      .safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    return existsSync(parsed.data.path) ? parsed.data.path : null;
  } catch {
    return null;
  }
}

export function saveLlamaModelPath(modelPath: string): void {
  writeFileSync(
    llamaModelStatePath(),
    JSON.stringify({ path: modelPath }, null, 2),
    'utf8'
  );
}
