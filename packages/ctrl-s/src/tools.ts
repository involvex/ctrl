import { z } from 'zod';
import { approvalDecisionSchema } from './events';

export const toolRiskSchema = z.enum(['low', 'high']);
export type ToolRisk = z.infer<typeof toolRiskSchema>;

export const toolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  /** JSON-Schema-like parameter object (validated loosely for now). */
  parameters: z.record(z.string(), z.unknown()).default({}),
  requiresApproval: z.boolean().default(false),
  risk: toolRiskSchema.default('low'),
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  instructions: z.string().default(''),
  toolNames: z.array(z.string()).default([]),
  requireApprovalFor: z.array(z.string()).default([]),
  runTimeoutMs: z.number().int().positive().default(60_000),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const createAgentProfileInputSchema = z.object({
  name: z.string().min(1).max(200),
  instructions: z.string().max(20_000).optional(),
  toolNames: z.array(z.string()).optional(),
  requireApprovalFor: z.array(z.string()).optional(),
  runTimeoutMs: z.number().int().positive().optional(),
});

export const auditActionSchema = z.enum([
  'run.started',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'tool.requested',
  'tool.started',
  'tool.completed',
  'tool.denied',
  'approval.requested',
  'approval.resolved',
]);

export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  conversationId: z.string().nullable(),
  runId: z.string().nullable(),
  action: auditActionSchema,
  detail: z.unknown().optional(),
  createdAt: z.number().int().nonnegative(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** Client → gateway control messages on the run WebSocket. */
export const clientControlMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('approval.resolve'),
    approvalId: z.string(),
    decision: z.enum(['approved', 'denied']),
  }),
  z.object({
    type: z.literal('run.cancel'),
    reason: z.string().optional(),
  }),
]);

export type ClientControlMessage = z.infer<typeof clientControlMessageSchema>;
