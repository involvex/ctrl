import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type EncryptedStore = Record<string, string>;

/**
 * Persist secrets with Electron safeStorage (OS keychain / DPAPI).
 * Falls back to refusing writes when encryption is unavailable.
 */
export class SecretVault {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath ?? path.join(app.getPath('userData'), 'secrets.bin.json');
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  get(key: string): string | null {
    const store = this.read();
    const blob = store[key];
    if (!blob) {
      return null;
    }
    if (!this.isAvailable()) {
      return null;
    }
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'));
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    if (!this.isAvailable()) {
      throw new Error('safeStorage encryption is not available on this system');
    }
    const store = this.read();
    store[key] = safeStorage.encryptString(value).toString('base64');
    this.write(store);
  }

  delete(key: string): void {
    const store = this.read();
    if (key in store) {
      delete store[key];
      this.write(store);
    }
  }

  /** Ensure a gateway pairing token exists; create one if missing. */
  ensureGatewayToken(): string {
    const existing = this.get('gatewayToken');
    if (existing) {
      return existing;
    }
    const token = `ctrl_${crypto.randomUUID().replaceAll('-', '')}`;
    this.set('gatewayToken', token);
    return token;
  }

  rotateGatewayToken(): string {
    const token = `ctrl_${crypto.randomUUID().replaceAll('-', '')}`;
    this.set('gatewayToken', token);
    return token;
  }

  private read(): EncryptedStore {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {};
      }
      const raw: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
      }
      const out: EncryptedStore = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string') {
          out[k] = v;
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private write(store: EncryptedStore): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(store), 'utf8');
  }
}
