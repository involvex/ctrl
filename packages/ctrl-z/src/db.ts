import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 2;

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

  db.query(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('schema_version', String(SCHEMA_VERSION));
}
