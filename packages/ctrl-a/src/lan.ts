import os from 'node:os';

/** IPv4 addresses suitable for LAN clients (excludes loopback / link-local). */
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

export function listLanGatewayUrls(port: number): string[] {
  return listLanAddresses().map((ip) => `http://${ip}:${port}`);
}
