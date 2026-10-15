import { z } from 'zod';

export const thermalStateSchema = z.enum([
  'nominal',
  'fair',
  'serious',
  'critical',
  'unknown',
]);
export type ThermalState = z.infer<typeof thermalStateSchema>;

export const batteryStateSchema = z.enum([
  'unknown',
  'unplugged',
  'charging',
  'full',
]);
export type BatteryState = z.infer<typeof batteryStateSchema>;

export const inferenceBackendSchema = z.enum(['cpu', 'gpu', 'npu']);
export type InferenceBackend = z.infer<typeof inferenceBackendSchema>;

export const deviceCapabilitiesSchema = z.object({
  platform: z.enum(['android', 'ios', 'web', 'unknown']),
  isDevice: z.boolean(),
  abi: z.array(z.string()).default([]),
  isArm64: z.boolean(),
  apiLevel: z.number().int().nullable(),
  totalMemoryMb: z.number().nonnegative().nullable(),
  batteryLevel: z.number().min(0).max(1).nullable(),
  batteryState: batteryStateSchema,
  lowPowerMode: z.boolean(),
  thermalState: thermalStateSchema,
  backends: z.object({
    cpu: z.boolean(),
    gpu: z.boolean(),
    npu: z.boolean(),
  }),
  litertAvailable: z.boolean(),
});

export type DeviceCapabilities = z.infer<typeof deviceCapabilitiesSchema>;

export const onDeviceModelRequestSchema = z.object({
  /** Model id / constant name (e.g. GEMMA_4_E2B_IT). */
  modelId: z.string().min(1),
  /** Approx weight + KV footprint the policy should reserve. */
  minMemoryMb: z.number().int().positive().default(4096),
  preferredBackend: inferenceBackendSchema.default('cpu'),
});

export type OnDeviceModelRequest = z.infer<typeof onDeviceModelRequestSchema>;

export const policyDecisionSchema = z.object({
  allowed: z.boolean(),
  backend: inferenceBackendSchema.nullable(),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

const MIN_ANDROID_API = 26;
const MIN_BATTERY_UNPLUGGED = 0.2;

function preferBackend(
  caps: DeviceCapabilities,
  preferred: InferenceBackend
): InferenceBackend | null {
  const order: InferenceBackend[] =
    preferred === 'npu'
      ? ['npu', 'gpu', 'cpu']
      : preferred === 'gpu'
        ? ['gpu', 'cpu']
        : ['cpu', 'gpu', 'npu'];

  for (const backend of order) {
    if (caps.backends[backend]) {
      return backend;
    }
  }
  return null;
}

/**
 * Decide whether on-device inference may start given live capabilities.
 * Pure function — used by the mobile client before loading LiteRT-LM.
 */
export function evaluateOnDevicePolicy(
  rawCaps: DeviceCapabilities,
  rawRequest: OnDeviceModelRequest
): PolicyDecision {
  const caps = deviceCapabilitiesSchema.parse(rawCaps);
  const request = onDeviceModelRequestSchema.parse(rawRequest);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (caps.platform !== 'android') {
    reasons.push(
      `platform ${caps.platform} is not supported for LiteRT-LM MVP`
    );
  }
  if (!caps.isArm64) {
    reasons.push('arm64-v8a required (x86 emulators unsupported)');
  }
  if (caps.apiLevel !== null && caps.apiLevel < MIN_ANDROID_API) {
    reasons.push(`Android API ${caps.apiLevel} < ${MIN_ANDROID_API}`);
  }
  if (!caps.litertAvailable) {
    reasons.push('LiteRT-LM native module unavailable in this build');
  }
  if (caps.totalMemoryMb !== null && caps.totalMemoryMb < request.minMemoryMb) {
    reasons.push(
      `RAM ${Math.round(caps.totalMemoryMb)} MB < model floor ${request.minMemoryMb} MB`
    );
  }
  if (caps.thermalState === 'critical' || caps.thermalState === 'serious') {
    reasons.push(`thermal state ${caps.thermalState} blocks inference`);
  } else if (caps.thermalState === 'fair') {
    warnings.push('thermal state fair — prefer CPU and short prompts');
  }
  if (caps.lowPowerMode) {
    reasons.push('low-power mode enabled');
  }
  if (
    caps.batteryLevel !== null &&
    caps.batteryState === 'unplugged' &&
    caps.batteryLevel < MIN_BATTERY_UNPLUGGED
  ) {
    reasons.push(
      `battery ${Math.round(caps.batteryLevel * 100)}% < ${MIN_BATTERY_UNPLUGGED * 100}% while unplugged`
    );
  } else if (
    caps.batteryLevel !== null &&
    caps.batteryState === 'unplugged' &&
    caps.batteryLevel < 0.35
  ) {
    warnings.push('battery under 35% — inference may be throttled');
  }

  const backend = preferBackend(caps, request.preferredBackend);
  if (!backend) {
    reasons.push('no inference backend available');
  }

  const allowed = reasons.length === 0 && backend !== null;
  return policyDecisionSchema.parse({
    allowed,
    backend: allowed ? backend : null,
    reasons,
    warnings,
  });
}
