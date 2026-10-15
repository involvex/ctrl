import { app, dialog } from 'electron';
import type { AppUpdater, UpdateInfo } from 'electron-updater';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'disabled'; reason: string }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

type StatusListener = (status: UpdateStatus) => void;

/**
 * Auto-update scaffold. Uses electron-updater when packaged;
 * no-ops in development.
 */
export class UpdateManager {
  private status: UpdateStatus = { state: 'idle' };
  private readonly listeners = new Set<StatusListener>();
  private autoUpdater: AppUpdater | null = null;

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  async init(): Promise<void> {
    if (!app.isPackaged) {
      this.setStatus({
        state: 'disabled',
        reason: 'updates disabled in development',
      });
      return;
    }

    try {
      const mod = await import('electron-updater');
      const updater = mod.autoUpdater;
      this.autoUpdater = updater;
      updater.on('checking-for-update', () => {
        this.setStatus({ state: 'checking' });
      });
      updater.on('update-available', (info: UpdateInfo) => {
        this.setStatus({
          state: 'available',
          version: info.version,
        });
      });
      updater.on('update-not-available', () => {
        this.setStatus({ state: 'not-available' });
      });
      updater.on('update-downloaded', (info: UpdateInfo) => {
        this.setStatus({
          state: 'downloaded',
          version: info.version,
        });
        void dialog
          .showMessageBox({
            type: 'info',
            title: 'Update ready',
            message: 'A new version of ctrl has been downloaded.',
            detail: 'Restart to apply the update.',
            buttons: ['Restart', 'Later'],
            defaultId: 0,
            cancelId: 1,
          })
          .then((result) => {
            if (result.response === 0) {
              updater.quitAndInstall();
            }
            return undefined;
          });
      });
      updater.on('error', (err: Error) => {
        this.setStatus({
          state: 'error',
          message: err.message,
        });
      });
    } catch (err) {
      this.setStatus({
        state: 'disabled',
        reason:
          err instanceof Error ? err.message : 'electron-updater not available',
      });
    }
  }

  async check(): Promise<UpdateStatus> {
    if (!this.autoUpdater) {
      return this.status;
    }
    try {
      await this.autoUpdater.checkForUpdatesAndNotify();
    } catch (err) {
      this.setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return this.status;
  }

  private setStatus(next: UpdateStatus): void {
    this.status = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}
