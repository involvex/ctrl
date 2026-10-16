import {
  createBackupInputSchema,
  hostBackupEncryptedSnapshotSchema,
  hostBackupManifestSchema,
  hostBackupPlainSnapshotSchema,
  hostBackupSnapshotSchema,
  restoreBackupInputSchema,
  type CreateBackupInput,
  type HostBackupManifest,
  type HostBackupPlainSnapshot,
  type HostBackupSnapshot,
  type RestoreBackupInput,
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
import { decryptUtf8, encryptUtf8 } from './backup-crypto';
import type { Store } from './store';

function newId(): string {
  return crypto.randomUUID();
}

function decryptSnapshot(
  snap: HostBackupSnapshot,
  passphrase: string | undefined
): HostBackupPlainSnapshot {
  if (!snap.encrypted) {
    return snap;
  }
  if (!passphrase) {
    throw new Error('passphrase required for encrypted backup');
  }
  const json = decryptUtf8(
    {
      salt: snap.salt,
      iv: snap.iv,
      tag: snap.tag,
      ciphertext: snap.ciphertext,
    },
    passphrase
  );
  const workspaces = JSON.parse(json) as unknown;
  return hostBackupPlainSnapshotSchema.parse({
    version: 1,
    id: snap.id,
    createdAt: snap.createdAt,
    label: snap.label,
    encrypted: false,
    workspaces,
  });
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
        const workspaceCount = snap.encrypted
          ? snap.workspaceCount
          : snap.workspaces.length;
        items.push(
          hostBackupManifestSchema.parse({
            id: snap.id,
            createdAt: snap.createdAt,
            label: snap.label,
            encrypted: snap.encrypted,
            workspaceCount,
            bytes: st.size,
          })
        );
      } catch {
        // Skip corrupt files.
      }
    }
    const sorted = items.slice();
    sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
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

  /** Return plaintext dump; decrypts when passphrase is provided for encrypted snaps. */
  getPlain(id: string, passphrase?: string): HostBackupPlainSnapshot | null {
    const snap = this.get(id);
    if (!snap) {
      return null;
    }
    return decryptSnapshot(snap, passphrase);
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
    const label = input.label ?? null;

    let snapshot: HostBackupSnapshot;
    if (input.passphrase) {
      const blob = encryptUtf8(JSON.stringify(dumps), input.passphrase);
      snapshot = hostBackupEncryptedSnapshotSchema.parse({
        version: 1,
        id,
        createdAt,
        label,
        encrypted: true,
        workspaceCount: dumps.length,
        ...blob,
      });
    } else {
      snapshot = hostBackupPlainSnapshotSchema.parse({
        version: 1,
        id,
        createdAt,
        label,
        encrypted: false,
        workspaces: dumps,
      });
    }

    const full = path.join(this.dir, `${id}.json`);
    const body = JSON.stringify(snapshot, null, 2);
    writeFileSync(full, body, 'utf8');

    return hostBackupManifestSchema.parse({
      id,
      createdAt,
      label,
      encrypted: Boolean(input.passphrase),
      workspaceCount: dumps.length,
      bytes: Buffer.byteLength(body, 'utf8'),
    });
  }

  /** Restore each workspace dump as a new workspace (safe default). */
  restore(
    id: string,
    rawInput: RestoreBackupInput = { asNew: true }
  ): { backupId: string; workspaces: Workspace[] } {
    const input = restoreBackupInputSchema.parse(rawInput);
    const plain = this.getPlain(id, input.passphrase);
    if (!plain) {
      throw new Error('backup not found');
    }
    const workspaces: Workspace[] = [];
    for (const dump of plain.workspaces) {
      workspaces.push(this.store.importWorkspace(dump));
    }
    return { backupId: id, workspaces };
  }
}
