import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  service: z.literal('ctrl-a'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
