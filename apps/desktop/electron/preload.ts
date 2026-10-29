import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ctrlDesktop', {
  platform: process.platform,
  getGatewayUrl: (): Promise<string> => ipcRenderer.invoke('gateway:getUrl'),
  getGatewayStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('gateway:getStatus'),
  getLanUrls: (): Promise<string[]> => ipcRenderer.invoke('gateway:getLanUrls'),
  getAutostart: (): Promise<{ openAtLogin: boolean }> =>
    ipcRenderer.invoke('host:getAutostart'),
  setAutostart: (next: {
    openAtLogin: boolean;
  }): Promise<{ openAtLogin: boolean }> =>
    ipcRenderer.invoke('host:setAutostart', next),
  getUpdateStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('host:getUpdateStatus'),
  checkForUpdates: (): Promise<unknown> =>
    ipcRenderer.invoke('host:checkForUpdates'),
  secretsAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('secrets:isAvailable'),
  getGatewayToken: (): Promise<string | null> =>
    ipcRenderer.invoke('secrets:getGatewayToken'),
  rotateGatewayToken: (): Promise<string | null> =>
    ipcRenderer.invoke('secrets:rotateGatewayToken'),
  setOpenAiKey: (key: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('secrets:setOpenAiKey', key),
  hasOpenAiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('secrets:hasOpenAiKey'),
  listLocalBackends: (): Promise<unknown> =>
    ipcRenderer.invoke('localBackends:list'),
  startLocalBackend: (id: string): Promise<unknown> =>
    ipcRenderer.invoke('localBackends:start', id),
  stopLocalBackend: (id: string): Promise<unknown> =>
    ipcRenderer.invoke('localBackends:stop', id),
  setLocalBackendBin: (id: string, binPath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('localBackends:setBin', { id, binPath }),
});
