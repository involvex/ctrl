import { z } from 'zod';

export const skillManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'skill id must be alphanumeric'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  instructions: z.string().max(50_000).default(''),
  toolNames: z.array(z.string()).default([]),
  enabled: z.boolean().default(false),
  builtin: z.boolean().default(false),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const createSkillInputSchema = z.object({
  id: skillManifestSchema.shape.id,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(50_000).optional(),
  toolNames: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export type CreateSkillInput = z.infer<typeof createSkillInputSchema>;

export const updateSkillInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(50_000).optional(),
  toolNames: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateSkillInput = z.infer<typeof updateSkillInputSchema>;

export const mcpServerConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'mcp server id must be alphanumeric'),
  name: z.string().min(1).max(200),
  /** Command to spawn (stdio). Empty = stub/disabled. */
  command: z.string().default(''),
  args: z.array(z.string()).default([]),
});

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

export const createMcpServerInputSchema = z.object({
  id: mcpServerConfigSchema.shape.id,
  name: z.string().min(1).max(200),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export type CreateMcpServerInput = z.infer<typeof createMcpServerInputSchema>;

export const persistedMcpFileSchema = z.object({
  version: z.literal(1),
  servers: z.array(mcpServerConfigSchema).default([]),
});

export type PersistedMcpFile = z.infer<typeof persistedMcpFileSchema>;

export const persistedSkillsStateSchema = z.object({
  version: z.literal(1),
  /** Enabled skill ids (builtin + user). */
  enabled: z.array(z.string()).default([]),
});

export type PersistedSkillsState = z.infer<typeof persistedSkillsStateSchema>;
