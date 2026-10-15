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

export const hostBackupSnapshotSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  label: z.string().min(1).nullable(),
  /** Reserved for Phase 7b passphrase encryption. */
  encrypted: z.literal(false),
  workspaces: z.array(workspaceExportSchema),
});

export type HostBackupSnapshot = z.infer<typeof hostBackupSnapshotSchema>;

export const createBackupInputSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  /** When set, only these workspace IDs are included; default = all. */
  workspaceIds: z.array(z.string().min(1)).optional(),
});

export type CreateBackupInput = z.infer<typeof createBackupInputSchema>;

export const restoreBackupInputSchema = z.object({
  /** When true, restore as new workspaces (safe default). */
  asNew: z.boolean().default(true),
});

export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;

export const restoreBackupResultSchema = z.object({
  backupId: z.string().min(1),
  workspaceIds: z.array(z.string().min(1)),
});

export type RestoreBackupResult = z.infer<typeof restoreBackupResultSchema>;
