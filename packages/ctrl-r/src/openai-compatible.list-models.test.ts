import { describe, expect, test } from 'bun:test';
import { OpenAICompatibleProvider } from './openai-compatible';

describe('OpenAICompatibleProvider.listModels', () => {
  test('parses OpenAI-style /models fixture', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'gemma-local' }, { id: 'tiny' }],
        }),
        { status: 200 }
      )) as unknown as typeof fetch;

    try {
      const provider = new OpenAICompatibleProvider({
        apiKey: 'local',
        baseUrl: 'http://127.0.0.1:9379/v1',
        defaultModel: 'fallback',
        id: 'litert',
      });
      const models = await provider.listModels();
      expect(models.map((m) => m.id)).toEqual(['gemma-local', 'tiny']);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('falls back to defaultModel when /models fails', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    try {
      const provider = new OpenAICompatibleProvider({
        apiKey: 'local',
        baseUrl: 'http://127.0.0.1:8080/v1',
        defaultModel: 'local-fallback',
      });
      const models = await provider.listModels();
      expect(models).toEqual([
        { id: 'local-fallback', displayName: 'local-fallback' },
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
