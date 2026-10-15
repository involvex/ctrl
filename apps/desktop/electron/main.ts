import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { getAutostart, setAutostart } from './autostart';
import { GatewayManager } from './gateway-manager';
import { registerDesktopIpc } from './ipc';
import { SecretVault } from './secrets';
import { createAppTray } from './tray';
import { UpdateManager } from './updater';

let gateway: GatewayManager | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let vault: SecretVault | null = null;
let updates: UpdateManager | null = null;

function resolveRepoRoot(): string {
  return path.resolve(app.getAppPath(), '../..');
}

function showWindow(): void {
  if (!mainWindow) {
    if (gateway) {
      createWindow(gateway.getUrl());
    }
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

function createWindow(gatewayUrl: string): void {
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
    void win.webContents.executeJavaScript(
      `window.ctrlGatewayUrl = ${JSON.stringify(gatewayUrl)}`
    );
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
  const envExtra: Record<string, string> = {};
  try {
    if (vault.isAvailable()) {
      envExtra['CTRL_GATEWAY_TOKEN'] = vault.ensureGatewayToken();
      const openaiKey = vault.get('openaiApiKey');
      if (openaiKey) {
        envExtra['CTRL_OPENAI_API_KEY'] = openaiKey;
        envExtra['CTRL_PROVIDER'] = process.env['CTRL_PROVIDER'] ?? 'openai';
      }
    }
  } catch (err) {
    process.stderr.write(
      `[ctrl-desktop] safeStorage unavailable: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }

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
    getAutostart,
    setAutostart,
  });

  const url = await gateway.start();
  createWindow(url);

  createAppTray({
    gateway,
    showWindow,
    quit: requestQuit,
  });

  if (app.isPackaged) {
    void updates.check();
  }

  app.on('activate', () => {
    showWindow();
  });
}

void bootstrap();

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms during Phase 3.
});

app.on('before-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true;
  }
  if (!gateway || gateway.getStatus().state === 'stopped') {
    return;
  }
  event.preventDefault();
  void gateway.stop().finally(() => {
    app.exit(0);
  });
});
