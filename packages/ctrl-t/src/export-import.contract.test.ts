import { describe, expect, test } from 'bun:test';
import {
  createConversation,
  createWorkspace,
  exportWorkspace,
  importWorkspace,
  listConversations,
  listMessages,
  streamChat,
} from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: export/import', () => {
  test('export workspace and re-import as a new workspace', async () => {
    const ws = await createWorkspace(baseUrl(), 'export-src');
    const conversation = await createConversation(
      baseUrl(),
      ws.id,
      'export-chat'
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('chat stream timed out'));
      }, 10_000);
      streamChat(baseUrl(), conversation.id, 'persist me', {
        onEvent: () => undefined,
        onError: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        onClose: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
    });

    const dump = await exportWorkspace(baseUrl(), ws.id);
    expect(dump.version).toBe(1);
    expect(dump.workspace.name).toBe('export-src');
    expect(dump.conversations.length).toBe(1);

    const imported = await importWorkspace(baseUrl(), dump);
    expect(imported.id).not.toBe(ws.id);
    expect(imported.name).toBe('export-src');

    const conversations = await listConversations(baseUrl(), imported.id);
    expect(conversations.length).toBe(1);
    const messages = await listMessages(baseUrl(), conversations[0]!.id);
    expect(
      messages.some((m) => m.role === 'user' && m.content === 'persist me')
    ).toBe(true);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
  });
});
