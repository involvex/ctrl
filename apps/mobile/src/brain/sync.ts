import {
  checkHealth,
  createBrainSyncApi,
  setClientAuth,
  syncClientBrain,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from '../connection/storage';
import { saveBrain, type BrainState } from './store';

export type SyncResult =
  | { ok: true; brain: BrainState; pushed: number; pulled: number }
  | { ok: false; reason: string; brain: BrainState };

/**
 * Multi-conversation append-only sync when the paired gateway answers /healthz.
 */
export async function syncBrainWithGateway(
  brain: BrainState
): Promise<SyncResult> {
  const saved = await loadSavedConnection();
  if (!saved) {
    return { ok: false, reason: 'not paired', brain };
  }
  setClientAuth({ token: saved.token || undefined });

  try {
    await checkHealth(saved.gatewayUrl);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'PC offline',
      brain,
    };
  }

  const result = await syncClientBrain(
    brain,
    createBrainSyncApi(saved.gatewayUrl),
    { workspaceName: 'Mobile' }
  );

  if (result.ok) {
    await saveBrain(result.brain);
    return {
      ok: true,
      brain: result.brain,
      pushed: result.pushed,
      pulled: result.pulled,
    };
  }

  return {
    ok: false,
    reason: result.reason,
    brain: result.brain,
  };
}
