import {
  app,
  clipboard,
  Menu,
  nativeImage,
  Tray,
  type NativeImage,
} from 'electron';
import type { GatewayManager } from './gateway-manager';

function trayIcon(): NativeImage {
  // 16×16 accent PNG — no external asset required
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVQ4T2NkYGD4z0ABYBxVMKoQBwAp6gEBmQm2WQAAAABJRU5ErkJggg==',
    'base64'
  );
  return nativeImage.createFromBuffer(png);
}

export type TrayController = {
  destroy: () => void;
};

export function createAppTray(opts: {
  gateway: GatewayManager;
  showWindow: () => void;
  quit: () => void;
}): TrayController {
  const tray = new Tray(trayIcon());
  tray.setToolTip('ctrl');

  const rebuild = (statusLabel: string): void => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show ctrl',
        click: () => {
          opts.showWindow();
        },
      },
      { type: 'separator' },
      {
        label: `Gateway: ${statusLabel}`,
        enabled: false,
      },
      {
        label: 'Copy gateway URL',
        click: () => {
          void clipboard.writeText(opts.gateway.getUrl());
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          opts.quit();
        },
      },
    ]);
    tray.setContextMenu(menu);
  };

  rebuild(opts.gateway.getStatus().state);

  tray.on('double-click', () => {
    opts.showWindow();
  });

  const unsub = opts.gateway.onStatus((status) => {
    rebuild(status.state);
  });

  app.on('before-quit', () => {
    unsub();
  });

  return {
    destroy: () => {
      unsub();
      tray.destroy();
    },
  };
}
