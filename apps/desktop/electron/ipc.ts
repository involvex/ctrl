import { app, dialog, ipcMain } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { AutostartSettings } from './autostart';
import type { GatewayManager, GatewayStatus } from './gateway-manager';
import { listLanAddresses } from './lan';
import type { LocalBackendId, LocalBackendsManager } from './local-backends';
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

  ipcMain.handle('localBackends:pickBin', async (_e, raw: unknown) => {
    const input = z.object({ id: backendIdSchema }).parse(raw);
    const result = await dialog.showOpenDialog({
      title: `Select ${input.id} binary`,
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [
              { name: 'Executables', extensions: ['exe'] },
              { name: 'All files', extensions: ['*'] },
            ]
          : [{ name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, path: null };
    }
    const binPath = result.filePaths[0]!;
    deps.localBackends.setBinPath(input.id, binPath);
    if (deps.vault?.isAvailable()) {
      deps.vault.set(`localBin:${input.id}`, binPath);
    }
    return { ok: true as const, path: binPath };
  });

  ipcMain.handle('localBackends:downloadBin', async (event, raw: unknown) => {
    const input = z
      .object({
        id: backendIdSchema,
        url: z.string().url(),
      })
      .parse(raw);
    const dir = path.join(app.getPath('userData'), 'bin');
    mkdirSync(dir, { recursive: true });
    const ext = process.platform === 'win32' ? '.exe' : '';
    const target = path.join(dir, `${input.id}${ext}`);

    const { createWriteStream, existsSync, statSync } = await import('node:fs');
    let start = 0;
    if (existsSync(target)) {
      try {
        start = statSync(target).size;
      } catch {
        start = 0;
      }
    }

    const headers: Record<string, string> = {};
    if (start > 0) {
      headers['Range'] = `bytes=${start}-`;
    }

    const res = await fetch(input.url, { headers });
    if (!res.ok && res.status !== 206) {
      throw new Error(`download failed: ${res.status}`);
    }

    const contentLength = res.headers.get('content-length');
    const total = contentLength ? Number(contentLength) + start : undefined;

    const fileStream = createWriteStream(target, {
      flags: start > 0 ? 'a' : 'w',
    });
    const webContents = event.sender;

    if (!res.body) {
      throw new Error('download failed: no response body');
    }

    let downloaded = start;
    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          fileStream.write(Buffer.from(value));
          downloaded += value.byteLength;
          if (total) {
            webContents.send('localBackends:downloadProgress', {
              id: input.id,
              downloaded,
              total,
              percent: Math.round((downloaded / total) * 100),
            });
          } else {
            webContents.send('localBackends:downloadProgress', {
              id: input.id,
              downloaded,
            });
          }
        }
      }
    } finally {
      fileStream.end();
      await new Promise<void>((resolve) => fileStream.on('finish', resolve));
    }

    deps.localBackends.setBinPath(input.id, target);
    if (deps.vault?.isAvailable()) {
      deps.vault.set(`localBin:${input.id}`, target);
    }
    webContents.send('localBackends:downloadProgress', {
      id: input.id,
      downloaded,
      total,
      percent: total ? 100 : undefined,
      done: true,
    });
    return { ok: true, path: target };
  });
}
