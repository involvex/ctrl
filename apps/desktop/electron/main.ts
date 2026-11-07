import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { getAutostart, setAutostart } from './autostart';
import { GatewayManager } from './gateway-manager';
import { registerDesktopIpc } from './ipc';
import { LocalBackendsManager } from './local-backends';
import { SecretVault } from './secrets';
import { createAppTray } from './tray';
import { UpdateManager } from './updater';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let gateway: GatewayManager | null = null;
let localBackends: LocalBackendsManager | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let vault: SecretVault | null = null;
let updates: UpdateManager | null = null;

function resolveRepoRoot(): string {
  return path.resolve(app.getAppPath(), '../..');
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow(gateway?.getUrl() ?? '');
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function requestQuit(): void {
  isQuitting = true;
  app.quit();
}

function injectGatewayUrl(win: BrowserWindow, gatewayUrl: string): void {
  if (!gatewayUrl) {
    return;
  }
  void win.webContents.executeJavaScript(
    `window.ctrlGatewayUrl = ${JSON.stringify(gatewayUrl)}`
  );
}

function createWindow(gatewayUrl: string): void {
  if (mainWindow) {
    return;
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#000000',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;

  if (process.env['VITE_DEV_SERVER_URL']) {
    void win.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.on('did-finish-load', () => {
    injectGatewayUrl(win, gatewayUrl || gateway?.getUrl() || '');
  });

  // Close → hide to tray (Phase 3); Quit from tray/menu exits fully.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  vault = new SecretVault();
  localBackends = new LocalBackendsManager();
  const envExtra: Record<string, string> = {};
  try {
    if (vault.isAvailable()) {
      envExtra['CTRL_GATEWAY_TOKEN'] = vault.ensureGatewayToken();
      const openaiKey = vault.get('openaiApiKey');
      if (openaiKey) {
        envExtra['CTRL_OPENAI_API_KEY'] = openaiKey;
        envExtra['CTRL_PROVIDER'] = process.env['CTRL_PROVIDER'] ?? 'openai';
      }
      for (const id of ['llama', 'litert-lm'] as const) {
        const bin = vault.get(`localBin:${id}`);
        if (bin) {
          localBackends.setBinPath(id, bin);
        }
      }
    }
  } catch (err) {
    process.stderr.write(
      `[ctrl-desktop] safeStorage unavailable: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }

  Object.assign(envExtra, await localBackends.envExtras());

  gateway = new GatewayManager({
    repoRoot: resolveRepoRoot(),
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    envExtra,
  });

  updates = new UpdateManager();
  await updates.init();

  registerDesktopIpc({
    gateway,
    vault,
    updates,
    localBackends,
    getAutostart,
    setAutostart,
  });

  // Show UI immediately — do not wait for gateway health.
  createWindow('');
  createAppTray({
    gateway,
    showWindow,
    quit: requestQuit,
  });

  gateway.onStatus((status) => {
    if (status.state === 'running' && mainWindow) {
      injectGatewayUrl(mainWindow, status.url);
    }
  });

  void gateway.start().catch((err) => {
    process.stderr.write(
      `[ctrl-desktop] gateway.start error: ${err instanceof Error ? err.message : String(err)}\n`
    );
  });

  if (app.isPackaged) {
    void updates.check();
  }

  app.on('activate', () => {
    showWindow();
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    showWindow();
  });

  void bootstrap().catch((err) => {
    process.stderr.write(
      `[ctrl-desktop] bootstrap failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
  });
}

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms during Phase 3.
});

app.on('before-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true;
  }
  if (!gateway || gateway.getStatus().state === 'stopped') {
    void localBackends?.stopAll();
    return;
  }
  event.preventDefault();
  void Promise.all([
    gateway.stop(),
    localBackends?.stopAll() ?? Promise.resolve(),
  ]).finally(() => {
    app.exit(0);
  });
});
