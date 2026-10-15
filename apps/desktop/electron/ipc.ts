import { ipcMain } from 'electron';
import { z } from 'zod';
import type { GatewayManager, GatewayStatus } from './gateway-manager';

const channelSchema = z.enum(['gateway:getUrl', 'gateway:getStatus']);

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

export function registerGatewayIpc(gateway: GatewayManager): void {
  ipcMain.handle('gateway:getUrl', () => {
    channelSchema.parse('gateway:getUrl');
    return gateway.getUrl();
  });

  ipcMain.handle('gateway:getStatus', (): GatewayStatus => {
    channelSchema.parse('gateway:getStatus');
    return gatewayStatusSchema.parse(gateway.getStatus());
  });
}
