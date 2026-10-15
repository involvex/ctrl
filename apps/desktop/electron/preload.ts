import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ctrlDesktop', {
  platform: process.platform,
  getGatewayUrl: (): Promise<string> => ipcRenderer.invoke('gateway:getUrl'),
  getGatewayStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('gateway:getStatus'),
  getLanUrls: (): Promise<string[]> => ipcRenderer.invoke('gateway:getLanUrls'),
});
