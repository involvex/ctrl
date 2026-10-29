import { ipcMain } from 'electron';
import { z } from 'zod';
import type { AutostartSettings } from './autostart';
import type { GatewayManager, GatewayStatus } from './gateway-manager';
import { listLanAddresses } from './lan';
import type {
  LocalBackendId,
  LocalBackendsManager,
} from './local-backends';
import type { SecretVault } from './secrets';
import type { UpdateManager, UpdateStatus } from './updater';

const gatewayStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('stopped') }),
  z.object({ state: z.literal('starting'), attempt: z.number() }),
  z.object({
    state: z.literal('running'),
    url: z.string(),
    pid: z.number(),
  }),
  z.object({
    state: z.literal('restarting'),
    attempt: z.number(),
    delayMs: z.number(),
  }),
  z.object({ state: z.literal('failed'), error: z.string() }),
]);

const autostartInputSchema = z.object({
  openAtLogin: z.boolean(),
});

export type DesktopIpcDeps = {
  gateway: GatewayManager;
  vault: SecretVault | null;
  updates: UpdateManager;
  localBackends: LocalBackendsManager;
  getAutostart: () => AutostartSettings;
  setAutostart: (next: { openAtLogin: boolean }) => AutostartSettings;
};

export function registerDesktopIpc(deps: DesktopIpcDeps): void {
  ipcMain.handle('gateway:getUrl', () => deps.gateway.getUrl());

  ipcMain.handle('gateway:getStatus', (): GatewayStatus =>
    gatewayStatusSchema.parse(deps.gateway.getStatus())
  );

  ipcMain.handle('gateway:getLanUrls', (): string[] => {
    const port = new URL(deps.gateway.getUrl()).port;
    return listLanAddresses().map((ip) => `http://${ip}:${port}`);
  });

  ipcMain.handle('host:getAutostart', () => deps.getAutostart());

  ipcMain.handle('host:setAutostart', (_e, raw: unknown) => {
    const input = autostartInputSchema.parse(raw);
    return deps.setAutostart(input);
  });

  ipcMain.handle('host:getUpdateStatus', (): UpdateStatus =>
    deps.updates.getStatus()
  );

  ipcMain.handle(
    'host:checkForUpdates',
    async (): Promise<UpdateStatus> => await deps.updates.check()
  );

  ipcMain.handle(
    'secrets:isAvailable',
    () => deps.vault?.isAvailable() ?? false
  );

  ipcMain.handle('secrets:getGatewayToken', (): string | null => {
    if (!deps.vault?.isAvailable()) {
      return null;
    }
    return deps.vault.ensureGatewayToken();
  });

  ipcMain.handle('secrets:rotateGatewayToken', (): string | null => {
    if (!deps.vault?.isAvailable()) {
      return null;
    }
    return deps.vault.rotateGatewayToken();
  });

  ipcMain.handle(
    'secrets:setOpenAiKey',
    (_e, raw: unknown): { ok: boolean } => {
      const key = z.string().min(1).parse(raw);
      if (!deps.vault?.isAvailable()) {
        throw new Error('safeStorage unavailable');
      }
      deps.vault.set('openaiApiKey', key);
      return { ok: true };
    }
  );

  ipcMain.handle('secrets:hasOpenAiKey', (): boolean => {
    if (!deps.vault?.isAvailable()) {
      return false;
    }
    return deps.vault.get('openaiApiKey') !== null;
  });

  const backendIdSchema = z.enum(['llama', 'litert-lm']);

  ipcMain.handle('localBackends:list', () => deps.localBackends.snapshot());

  ipcMain.handle('localBackends:start', async (_e, raw: unknown) => {
    const id: LocalBackendId = backendIdSchema.parse(raw);
    return deps.localBackends.start(id);
  });

  ipcMain.handle('localBackends:stop', async (_e, raw: unknown) => {
    const id: LocalBackendId = backendIdSchema.parse(raw);
    return deps.localBackends.stop(id);
  });

  ipcMain.handle('localBackends:setBin', (_e, raw: unknown) => {
    const input = z
      .object({
        id: backendIdSchema,
        binPath: z.string().min(1),
      })
      .parse(raw);
    deps.localBackends.setBinPath(input.id, input.binPath);
    if (deps.vault?.isAvailable()) {
      deps.vault.set(`localBin:${input.id}`, input.binPath);
    }
    return { ok: true };
  });
}
