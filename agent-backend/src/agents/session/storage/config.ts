import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SessionFilesBackend = 'local' | 'blob';

const AGENT_BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

/** Outside agent-backend so `flue dev` file watching does not reload on uploads. */
export function defaultSessionFilesRoot(): string {
  return path.resolve(AGENT_BACKEND_ROOT, '../.run/session-attachments');
}

export function resolveSessionFilesBackend(): SessionFilesBackend {
  const explicit = process.env.SESSION_FILES_BACKEND?.trim().toLowerCase();
  if (explicit === 'local' || explicit === 'blob') return explicit;
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return 'blob';
  return 'local';
}

export function resolveSessionFilesRoot(): string {
  return process.env.SESSION_FILES_ROOT?.trim() || defaultSessionFilesRoot();
}

export function resolveBlobReadWriteToken(): string | undefined {
  return (
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim() ||
    undefined
  );
}
