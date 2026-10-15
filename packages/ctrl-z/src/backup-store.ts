import {
  createBackupInputSchema,
  hostBackupManifestSchema,
  hostBackupSnapshotSchema,
  type CreateBackupInput,
  type HostBackupManifest,
  type HostBackupSnapshot,
  type Workspace,
  type WorkspaceExport,
} from '@involvex/ctrl-s';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { Store } from './store';

function newId(): string {
  return crypto.randomUUID();
}

/**
 * File-backed host backups under `{dataDir}/backups/{id}.json`.
 * Source of truth remains SQLite; this is snapshot/restore only.
 */
export class BackupStore {
  private readonly dir: string;

  constructor(
    dataDir: string,
    private readonly store: Store
  ) {
    this.dir = path.join(dataDir, 'backups');
    mkdirSync(this.dir, { recursive: true });
  }

  list(): HostBackupManifest[] {
    const files = readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    const items: HostBackupManifest[] = [];
    for (const file of files) {
      try {
        const full = path.join(this.dir, file);
        const raw = JSON.parse(readFileSync(full, 'utf8')) as unknown;
        const snap = hostBackupSnapshotSchema.parse(raw);
        const st = statSync(full);
        items.push(
          hostBackupManifestSchema.parse({
            id: snap.id,
            createdAt: snap.createdAt,
            label: snap.label,
            encrypted: snap.encrypted,
            workspaceCount: snap.workspaces.length,
            bytes: st.size,
          })
        );
      } catch {
        // Skip corrupt files.
      }
    }
    return items.toSorted((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): HostBackupSnapshot | null {
    const full = path.join(this.dir, `${id}.json`);
    try {
      return hostBackupSnapshotSchema.parse(
        JSON.parse(readFileSync(full, 'utf8')) as unknown
      );
    } catch {
      return null;
    }
  }

  create(rawInput: CreateBackupInput = {}): HostBackupManifest {
    const input = createBackupInputSchema.parse(rawInput);
    const all = this.store.listWorkspaces();
    const selected =
      input.workspaceIds && input.workspaceIds.length > 0
        ? all.filter((w) => input.workspaceIds!.includes(w.id))
        : all;

    if (selected.length === 0) {
      throw new Error('no workspaces to back up');
    }

    const missing = (input.workspaceIds ?? []).filter(
      (id) => !all.some((w) => w.id === id)
    );
    if (missing.length > 0) {
      throw new Error(`workspace not found: ${missing.join(', ')}`);
    }

    const dumps: WorkspaceExport[] = selected.map((w) =>
      this.store.exportWorkspace(w.id)
    );
    const id = newId();
    const createdAt = Date.now();
    const snapshot = hostBackupSnapshotSchema.parse({
      version: 1,
      id,
      createdAt,
      label: input.label ?? null,
      encrypted: false,
      workspaces: dumps,
    });

    const full = path.join(this.dir, `${id}.json`);
    const body = JSON.stringify(snapshot, null, 2);
    writeFileSync(full, body, 'utf8');

    return hostBackupManifestSchema.parse({
      id,
      createdAt,
      label: snapshot.label,
      encrypted: false,
      workspaceCount: dumps.length,
      bytes: Buffer.byteLength(body, 'utf8'),
    });
  }

  /** Restore each workspace dump as a new workspace (safe default). */
  restore(id: string): { backupId: string; workspaces: Workspace[] } {
    const snap = this.get(id);
    if (!snap) {
      throw new Error('backup not found');
    }
    const workspaces: Workspace[] = [];
    for (const dump of snap.workspaces) {
      workspaces.push(this.store.importWorkspace(dump));
    }
    return { backupId: id, workspaces };
  }
}
