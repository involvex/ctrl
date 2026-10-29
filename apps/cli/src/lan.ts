import os from 'node:os';

/** Interface names that usually are not phone-reachable Wi‑Fi / Ethernet. */
const DEMOTE_IFACE =
  /vethernet|hyper-v|docker|wsl|vbox|vmware|virtualbox|tailscale|zerotier|vpn|hamachi|radmin|npcap|loopback/i;

function scoreLanEntry(ip: string, ifaceName: string): number {
  let score = 0;
  if (ip.startsWith('192.168.')) {
    score = 300;
  } else if (ip.startsWith('10.')) {
    score = 200;
  } else {
    const m = /^172\.(\d+)\./.exec(ip);
    if (m) {
      const octet = Number(m[1]);
      if (octet >= 16 && octet <= 31) {
        score = 150;
      }
    }
  }
  if (DEMOTE_IFACE.test(ifaceName)) {
    score -= 250;
  }
  return score;
}

export function listLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const scored: Array<{ ip: string; score: number }> = [];
  for (const [ifaceName, entries] of Object.entries(nets)) {
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
      scored.push({
        ip: entry.address,
        score: scoreLanEntry(entry.address, ifaceName),
      });
    }
  }
  return [...scored]
    .sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip))
    .map((row) => row.ip);
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
