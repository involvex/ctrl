import { z } from 'zod';

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.unknown(),
});

export type ToolCall = z.infer<typeof toolCallSchema>;

export const tokenUsageSchema = z.object({
  promptTokens: z.number().nonnegative(),
  completionTokens: z.number().nonnegative(),
  totalTokens: z.number().nonnegative(),
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const serializedErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type SerializedError = z.infer<typeof serializedErrorSchema>;

export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.started'),
    runId: z.string(),
  }),
  z.object({
    type: z.literal('message.delta'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('reasoning.delta'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool.requested'),
    call: toolCallSchema,
  }),
  z.object({
    type: z.literal('tool.started'),
    callId: z.string(),
  }),
  z.object({
    type: z.literal('tool.completed'),
    callId: z.string(),
    result: z.unknown(),
  }),
  z.object({
    type: z.literal('usage.updated'),
    usage: tokenUsageSchema,
  }),
  z.object({
    type: z.literal('run.completed'),
    finishReason: z.string(),
  }),
  z.object({
    type: z.literal('run.failed'),
    error: serializedErrorSchema,
  }),
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
