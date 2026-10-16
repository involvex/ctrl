import { z } from 'zod';
import { workspaceExportSchema } from './domain';

/** On-host backup snapshot (Phase 7). Not a peer SQLite sync. */
export const hostBackupManifestSchema = z.object({
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  label: z.string().min(1).nullable(),
  encrypted: z.boolean(),
  workspaceCount: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative().optional(),
});

export type HostBackupManifest = z.infer<typeof hostBackupManifestSchema>;

const backupMeta = {
  version: z.literal(1),
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  label: z.string().min(1).nullable(),
};

export const hostBackupPlainSnapshotSchema = z.object({
  ...backupMeta,
  encrypted: z.literal(false),
  workspaces: z.array(workspaceExportSchema),
});

export const hostBackupEncryptedSnapshotSchema = z.object({
  ...backupMeta,
  encrypted: z.literal(true),
  workspaceCount: z.number().int().nonnegative(),
  salt: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1),
});

export const hostBackupSnapshotSchema = z.discriminatedUnion('encrypted', [
  hostBackupPlainSnapshotSchema,
  hostBackupEncryptedSnapshotSchema,
]);

export type HostBackupSnapshot = z.infer<typeof hostBackupSnapshotSchema>;
export type HostBackupPlainSnapshot = z.infer<
  typeof hostBackupPlainSnapshotSchema
>;
export type HostBackupEncryptedSnapshot = z.infer<
  typeof hostBackupEncryptedSnapshotSchema
>;

export const createBackupInputSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  /** When set, only these workspace IDs are included; default = all. */
  workspaceIds: z.array(z.string().min(1)).optional(),
  /** When set (≥8 chars), snapshot is AES-256-GCM encrypted at rest. */
  passphrase: z.string().min(8).max(500).optional(),
});

export type CreateBackupInput = z.infer<typeof createBackupInputSchema>;

export const restoreBackupInputSchema = z.object({
  /** When true, restore as new workspaces (safe default). */
  asNew: z.boolean().default(true),
  /** Required when the backup was created with a passphrase. */
  passphrase: z.string().min(8).max(500).optional(),
});

export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;

export const restoreBackupResultSchema = z.object({
  backupId: z.string().min(1),
  workspaceIds: z.array(z.string().min(1)),
});

export type RestoreBackupResult = z.infer<typeof restoreBackupResultSchema>;
