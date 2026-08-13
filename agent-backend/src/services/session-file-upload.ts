import { randomUUID } from 'node:crypto';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob';
import {
  SESSION_FILE_DEFAULT_TTL_DAYS,
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_MAX_PER_INSTANCE,
  isAllowedSessionFile,
  mimeTypeForSessionFile,
} from '../storage/session-files/constants.ts';
import { resolveBlobReadWriteToken, resolveSessionFilesBackend } from '../storage/session-files/config.ts';
import { blobOriginalKey, headBlobObject } from '../storage/session-files/blob-store.ts';
import { countSessionFilesForInstance, insertSessionFile } from '../storage/session-files/repository.ts';
import {
  deleteSessionFile,
  ensureSessionFileContentCached,
  getSessionFile,
} from '../storage/session-files/session-file-service.ts';
import type { SessionFileRecord } from '../storage/session-files/types.ts';

function newFileId(): string {
  return `sf_${randomUUID().replace(/-/g, '')}`;
}

function defaultExpiresAt(): Date {
  return new Date(Date.now() + SESSION_FILE_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function initSessionFileUpload(input: {
  instanceId: string;
  agentName: string;
  filename: string;
  sizeBytes: number;
}) {
  if (!isAllowedSessionFile(input.filename)) {
    throw new Error('Unsupported file type for session attachment.');
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (input.sizeBytes > SESSION_FILE_MAX_BYTES) {
    throw new Error('File is too large (max 10 MB).');
  }

  const count = await countSessionFilesForInstance(input.instanceId);
  if (count >= SESSION_FILE_MAX_PER_INSTANCE) {
    throw new Error(`Session file limit reached (max ${SESSION_FILE_MAX_PER_INSTANCE}).`);
  }

  const backend = resolveSessionFilesBackend();
  const fileId = newFileId();
  const mimeType = mimeTypeForSessionFile(input.filename);

  if (backend === 'local') {
    return {
      storage_backend: 'local' as const,
      file_id: fileId,
      use_multipart: true,
      mime_type: mimeType,
    };
  }

  const token = resolveBlobReadWriteToken();
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured for session file blob storage.');
  }

  const pathname = blobOriginalKey(input.instanceId, fileId, input.filename);
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname,
    token,
    maximumSizeInBytes: SESSION_FILE_MAX_BYTES,
    allowOverwrite: true,
    addRandomSuffix: false,
  });

  return {
    storage_backend: 'blob' as const,
    file_id: fileId,
    pathname,
    client_token: clientToken,
    mime_type: mimeType,
    use_multipart: false,
  };
}

export async function completeSessionFileBlobUpload(input: {
  instanceId: string;
  agentName: string;
  fileId: string;
  filename: string;
  pathname: string;
  sizeBytes: number;
}): Promise<SessionFileRecord> {
  if (!isAllowedSessionFile(input.filename)) {
    throw new Error('Unsupported file type for session attachment.');
  }
  if (resolveSessionFilesBackend() !== 'blob') {
    throw new Error('Session files are not using blob storage.');
  }

  const expectedPathname = blobOriginalKey(input.instanceId, input.fileId, input.filename);
  if (input.pathname !== expectedPathname) {
    throw new Error('pathname does not match file_id and filename');
  }

  const blobHead = await headBlobObject(expectedPathname);
  if (!blobHead) {
    throw new Error('Uploaded blob object not found in storage');
  }

  const mimeType = mimeTypeForSessionFile(input.filename);
  const record: SessionFileRecord = {
    id: input.fileId,
    instanceId: input.instanceId,
    agentName: input.agentName,
    filename: input.filename,
    mimeType,
    sizeBytes: input.sizeBytes,
    storageBackend: 'blob',
    storageKey: expectedPathname,
    contentCacheKey: null,
    expiresAt: defaultExpiresAt(),
    createdAt: new Date(),
  };
  await insertSessionFile(record);
  try {
    await ensureSessionFileContentCached(input.instanceId, input.fileId);
  } catch (error) {
    await deleteSessionFile(input.instanceId, input.fileId);
    throw error;
  }

  const refreshed = await getSessionFile(input.instanceId, input.fileId);
  return refreshed ?? record;
}
