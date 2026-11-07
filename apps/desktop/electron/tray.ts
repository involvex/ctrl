import {
  app,
  clipboard,
  Menu,
  nativeImage,
  Tray,
  type NativeImage,
} from 'electron';
import type { GatewayManager } from './gateway-manager';

/** Prevent GC from dropping the Tray handle on Windows. */
let activeTray: Tray | null = null;

/** Solid matrix-green tile — transparent placeholders are invisible in the Windows tray. */
function trayIcon(): NativeImage {
  const size = 16;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (edge) {
        rgba[i] = 0x00;
        rgba[i + 1] = 0x44;
        rgba[i + 2] = 0x22;
        rgba[i + 3] = 0xff;
      } else {
        rgba[i] = 0x00;
        rgba[i + 1] = 0xff;
        rgba[i + 2] = 0x66;
        rgba[i + 3] = 0xff;
      }
    }
  }
  const bitmap = nativeImage.createFromBitmap(rgba, {
    width: size,
    height: size,
  });
  // Round-trip through PNG — more reliable for Win32 tray than raw bitmap.
  return nativeImage.createFromBuffer(bitmap.toPNG());
}

export type TrayController = {
  destroy: () => void;
};

export function createAppTray(opts: {
  gateway: GatewayManager;
  showWindow: () => void;
  quit: () => void;
}): TrayController {
  const icon = trayIcon();
  if (icon.isEmpty()) {
    process.stderr.write('[ctrl-desktop] tray icon failed to render\n');
  }
  const tray = new Tray(icon);
  tray.setToolTip('ctrl');
  // Module-level hold so GC does not drop the tray on Windows.
  activeTray = tray;

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

  tray.on('click', () => {
    opts.showWindow();
  });
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
      if (activeTray === tray) {
        activeTray = null;
      }
    },
  };
}
