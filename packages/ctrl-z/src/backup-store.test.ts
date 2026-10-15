import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackupStore } from './backup-store';
import { openDatabase } from './db';
import { Store } from './store';

describe('BackupStore', () => {
  test('create → list → restore as new workspaces', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ctrl-backup-'));
    const db = openDatabase(path.join(root, 'app.db'));
    try {
      const store = new Store(db);
      const backups = new BackupStore(root, store);

      const ws = store.createWorkspace('alpha');
      const conv = store.createConversation(ws.id, 'c1');
      store.addMessage(conv.id, 'user', 'hello backup');

      const manifest = backups.create({ label: 'nightly' });
      expect(manifest.label).toBe('nightly');
      expect(manifest.workspaceCount).toBe(1);
      expect(manifest.encrypted).toBe(false);

      const listed = backups.list();
      expect(listed.some((b) => b.id === manifest.id)).toBe(true);

      const restored = backups.restore(manifest.id);
      expect(restored.workspaces.length).toBe(1);
      expect(restored.workspaces[0]!.id).not.toBe(ws.id);
      expect(restored.workspaces[0]!.name).toBe('alpha');

      const conversations = store.listConversations(restored.workspaces[0]!.id);
      expect(conversations.length).toBe(1);
      const messages = store.listMessages(conversations[0]!.id);
      expect(messages.some((m) => m.content === 'hello backup')).toBe(true);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
