import os from 'node:os';

export function listLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }
      if (entry.address.startsWith('169.254.')) {
        continue;
      }
      out.push(entry.address);
    }
  }
  return out;
}

export function pickLanUrl(port: number, preferredHost?: string): string {
  if (preferredHost) {
    return `http://${preferredHost}:${port}`;
  }
  const addrs = listLanAddresses();
  const first = addrs[0];
  if (!first) {
    throw new Error('no LAN IPv4 address found — pass --host <ip> explicitly');
  }
  return `http://${first}:${port}`;
}
