import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { GatewayManager } from './gateway-manager';
import { registerGatewayIpc } from './ipc';

let gateway: GatewayManager | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function resolveRepoRoot(): string {
  // app.getAppPath() → apps/desktop (dev) or asar root (packaged)
  return path.resolve(app.getAppPath(), '../..');
}

function createWindow(gatewayUrl: string): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#000000',
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

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  gateway = new GatewayManager({
    repoRoot: resolveRepoRoot(),
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  registerGatewayIpc(gateway);

  const url = await gateway.start();
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && gateway) {
      createWindow(gateway.getUrl());
    }
  });
}

void bootstrap();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting || !gateway || gateway.getStatus().state === 'stopped') {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  void gateway.stop().finally(() => {
    app.exit(0);
  });
});
