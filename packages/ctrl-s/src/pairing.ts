import { z } from 'zod';

/** QR / deep-link payload for Expo ↔ gateway pairing (Phase 8 preview). */
export const pairPayloadSchema = z.object({
  v: z.literal(1),
  gatewayUrl: z.string().url(),
  token: z.string().default(''),
});

export type PairPayload = z.infer<typeof pairPayloadSchema>;

export function encodePairPayload(payload: PairPayload): string {
  return JSON.stringify(pairPayloadSchema.parse(payload));
}

export function parsePairPayload(raw: string): PairPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return pairPayloadSchema.parse(JSON.parse(trimmed));
  } catch {
    // Plain URL fallback (manual / older QR).
    if (/^https?:\/\//i.test(trimmed)) {
      return pairPayloadSchema.parse({
        v: 1,
        gatewayUrl: trimmed,
        token: '',
      });
    }
    return null;
  }
}

export const pairingAckSchema = z.object({
  at: z.string().datetime(),
  label: z.string().min(1).max(120).optional(),
});

export type PairingAck = z.infer<typeof pairingAckSchema>;

export const pairingAckInputSchema = z.object({
  label: z.string().min(1).max(120).optional(),
});

export type PairingAckInput = z.infer<typeof pairingAckInputSchema>;

export const pairingStatusSchema = z.object({
  required: z.boolean(),
  port: z.number().int().positive().optional(),
  urls: z.array(z.string().url()).optional(),
  llama: z
    .object({
      state: z.string(),
    })
    .passthrough()
    .optional(),
  localBackends: z
    .array(
      z.object({
        id: z.enum(['llama', 'litert-lm']),
        port: z.number().int().positive(),
        running: z.boolean(),
        baseUrl: z.string().url().optional(),
        modelsPreview: z.array(z.string()).default([]),
      })
    )
    .optional(),
  lastAck: pairingAckSchema.optional().nullable(),
});

export type PairingStatus = z.infer<typeof pairingStatusSchema>;
