import os from 'node:os';

/** Prefer home Wi‑Fi / Ethernet over VPN / Hyper-V / Docker bridges. */
function scoreLanAddress(ip: string): number {
  if (ip.startsWith('192.168.')) {
    return 300;
  }
  if (ip.startsWith('10.')) {
    return 200;
  }
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const octet = Number(m[1]);
    if (octet >= 16 && octet <= 31) {
      return 150;
    }
  }
  return 0;
}

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
  return [...out].sort(
    (a, b) => scoreLanAddress(b) - scoreLanAddress(a) || a.localeCompare(b)
  );
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
