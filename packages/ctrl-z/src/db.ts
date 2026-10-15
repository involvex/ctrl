import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 4;

export type CtrlDb = Database;

export function openDatabase(dbPath: string): CtrlDb {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const row = db
    .query<{ value: string }, [string]>('SELECT value FROM meta WHERE key = ?')
    .get('schema_version');

  const current = row ? Number(row.value) : 0;

  if (current < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_workspace
        ON conversations(workspace_id);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, created_at);
    `);
  }

  if (current < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '',
        tool_names TEXT NOT NULL DEFAULT '[]',
        require_approval_for TEXT NOT NULL DEFAULT '[]',
        run_timeout_ms INTEGER NOT NULL DEFAULT 60000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT,
        conversation_id TEXT,
        run_id TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_created
        ON audit_logs(created_at DESC);
    `);
  }

  if (current < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        blob_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'failed')),
        error TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_workspace
        ON attachments(workspace_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY NOT NULL,
        attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_attachment
        ON knowledge_chunks(attachment_id, chunk_index);

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        content,
        chunk_id UNINDEXED,
        workspace_id UNINDEXED,
        filename UNINDEXED,
        tokenize = 'porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('note', 'fact', 'preference')),
        content TEXT NOT NULL,
        source_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('active', 'archived', 'pending_review')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_workspace
        ON memory_items(workspace_id, status, updated_at DESC);
    `);
  }

  if (current < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('webhook', 'telegram', 'discord', 'slack')),
        name TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL CHECK(status IN ('stopped', 'starting', 'running', 'error')),
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_channels_workspace
        ON channels(workspace_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS channel_identities (
        id TEXT PRIMARY KEY NOT NULL,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        external_user_id TEXT NOT NULL,
        display_name TEXT,
        local_user_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(channel_id, external_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_identities_channel
        ON channel_identities(channel_id);

      CREATE TABLE IF NOT EXISTS channel_messages (
        id TEXT PRIMARY KEY NOT NULL,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
        external_user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_channel_messages_channel
        ON channel_messages(channel_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS channel_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        external_user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sending', 'sent', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_channel_outbox_due
        ON channel_outbox(status, next_attempt_at);
    `);
  }

  db.query(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('schema_version', String(SCHEMA_VERSION));
}
