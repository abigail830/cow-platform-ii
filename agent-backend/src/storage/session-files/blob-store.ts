import { del, head, put } from '@vercel/blob';
import { resolveBlobReadWriteToken } from './config.ts';
import { sanitizeFilename } from './constants.ts';

function requireToken(): string {
  const token = resolveBlobReadWriteToken();
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured for session file blob storage.');
  }
  return token;
}

export function blobOriginalKey(instanceId: string, fileId: string, filename: string): string {
  const safeInstance = instanceId.replace(/[^a-zA-Z0-9._@-]/g, '_');
  return `session-attachments/${safeInstance}/${fileId}__${sanitizeFilename(filename)}`;
}

export function blobContentCacheKey(instanceId: string, fileId: string): string {
  const safeInstance = instanceId.replace(/[^a-zA-Z0-9._@-]/g, '_');
  return `session-attachments/${safeInstance}/${fileId}.content.txt`;
}

export async function writeBlobObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  await put(key, bytes, {
    access: 'public',
    token: requireToken(),
    contentType,
    addRandomSuffix: false,
  });
}

export async function writeBlobText(key: string, text: string): Promise<void> {
  await put(key, text, {
    access: 'public',
    token: requireToken(),
    contentType: 'text/plain; charset=utf-8',
    addRandomSuffix: false,
  });
}

export async function readBlobBytes(key: string): Promise<Buffer> {
  const meta = await head(key, { token: requireToken() });
  const response = await fetch(meta.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob ${key}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function readBlobText(key: string): Promise<string> {
  const bytes = await readBlobBytes(key);
  return bytes.toString('utf8');
}

export async function deleteBlobKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await del(keys, { token: requireToken() });
}
