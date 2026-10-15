import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function resolveBlobRoot(dataDir?: string): string {
  if (process.env['CTRL_BLOB_DIR']) {
    return process.env['CTRL_BLOB_DIR'];
  }
  const root =
    dataDir ?? process.env['CTRL_DATA_DIR'] ?? path.join(process.cwd(), 'data');
  return path.join(root, 'blobs');
}

export function writeBlob(
  blobRoot: string,
  workspaceId: string,
  attachmentId: string,
  filename: string,
  bytes: Uint8Array
): string {
  const dir = path.join(blobRoot, workspaceId);
  mkdirSync(dir, { recursive: true });
  const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 120);
  const relative = path.join(workspaceId, `${attachmentId}_${safeName}`);
  const absolute = path.join(blobRoot, relative);
  writeFileSync(absolute, bytes);
  return relative.replaceAll('\\', '/');
}

export function readBlob(blobRoot: string, blobPath: string): Buffer {
  const absolute = path.join(blobRoot, blobPath);
  if (!existsSync(absolute)) {
    throw new Error(`blob not found: ${blobPath}`);
  }
  return readFileSync(absolute);
}
