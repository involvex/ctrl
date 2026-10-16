import { describe, expect, test } from 'bun:test';
import {
  createBackup,
  createConversation,
  createWorkspace,
  listBackups,
  listConversations,
  listMessages,
  listWorkspaces,
  restoreBackup,
  streamChat,
} from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: host backups', () => {
  test('create → list → restore workspaces on host', async () => {
    const before = (await listWorkspaces(baseUrl())).length;
    const ws = await createWorkspace(baseUrl(), 'backup-src');
    const conversation = await createConversation(
      baseUrl(),
      ws.id,
      'backup-chat'
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('chat stream timed out'));
      }, 10_000);
      streamChat(baseUrl(), conversation.id, 'snapshot me', {
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

    const created = await createBackup(baseUrl(), {
      label: 'contract',
      workspaceIds: [ws.id],
    });
    expect(created.workspaceCount).toBe(1);
    expect(created.label).toBe('contract');

    const listed = await listBackups(baseUrl());
    expect(listed.some((b) => b.id === created.id)).toBe(true);

    const restored = await restoreBackup(baseUrl(), created.id);
    expect(restored.workspaceIds.length).toBe(1);
    expect(restored.workspaceIds[0]).not.toBe(ws.id);

    const after = await listWorkspaces(baseUrl());
    expect(after.length).toBeGreaterThanOrEqual(before + 2);

    const conversations = await listConversations(
      baseUrl(),
      restored.workspaceIds[0]!
    );
    expect(conversations.length).toBe(1);
    const messages = await listMessages(baseUrl(), conversations[0]!.id);
    expect(
      messages.some((m) => m.role === 'user' && m.content === 'snapshot me')
    ).toBe(true);

    const enc = await createBackup(baseUrl(), {
      label: 'enc-contract',
      workspaceIds: [ws.id],
      passphrase: 'contract-pass',
    });
    expect(enc.encrypted).toBe(true);
    let denied = false;
    try {
      await restoreBackup(baseUrl(), enc.id);
    } catch {
      denied = true;
    }
    expect(denied).toBe(true);
    const encRestored = await restoreBackup(baseUrl(), enc.id, {
      passphrase: 'contract-pass',
    });
    expect(encRestored.workspaceIds.length).toBe(1);
  });
});
