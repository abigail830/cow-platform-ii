import { randomUUID } from 'node:crypto';
import {
  SESSION_FILE_DEFAULT_TTL_DAYS,
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_MAX_PER_INSTANCE,
  isAllowedSessionFile,
  mimeTypeForSessionFile,
} from './constants.ts';
import { resolveSessionFilesBackend } from './config.ts';
import {
  countSessionFilesForInstance,
  deleteSessionFileRecord,
  getSessionFile,
  insertSessionFile,
  listSessionFilesForInstance,
  setSessionFileContentCacheKey,
} from './repository.ts';
import type { SessionFileListItem, SessionFileRecord } from './types.ts';
import { extractSessionFileText } from '../../shared/session-file-extract.ts';
import {
  blobContentCacheKey,
  blobOriginalKey,
  deleteBlobKeys,
  readBlobBytes,
  readBlobText,
  writeBlobObject,
  writeBlobText,
} from './blob-store.ts';
import {
  deleteLocalPaths,
  localContentCachePath,
  localOriginalPath,
  readLocalFile,
  writeLocalContentCache,
  writeLocalOriginal,
} from './local-store.ts';

function newFileId(): string {
  return `sf_${randomUUID().replace(/-/g, '')}`;
}

function defaultExpiresAt(): Date {
  const days = SESSION_FILE_DEFAULT_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function toListItem(record: SessionFileRecord): SessionFileListItem {
  return {
    fileId: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    hasContentCache: Boolean(record.contentCacheKey),
    createdAt: record.createdAt.toISOString(),
  };
}

export async function uploadSessionFile(options: {
  instanceId: string;
  agentName: string;
  filename: string;
  bytes: Buffer;
}): Promise<SessionFileRecord> {
  if (!isAllowedSessionFile(options.filename)) {
    throw new Error('Unsupported file type for session attachment.');
  }
  if (options.bytes.length > SESSION_FILE_MAX_BYTES) {
    throw new Error('File is too large (max 10 MB).');
  }
  const count = await countSessionFilesForInstance(options.instanceId);
  if (count >= SESSION_FILE_MAX_PER_INSTANCE) {
    throw new Error(`Session file limit reached (max ${SESSION_FILE_MAX_PER_INSTANCE}).`);
  }

  const backend = resolveSessionFilesBackend();
  const fileId = newFileId();
  const mimeType = mimeTypeForSessionFile(options.filename);
  let storageKey: string;

  if (backend === 'local') {
    storageKey = await writeLocalOriginal(
      options.instanceId,
      fileId,
      options.filename,
      options.bytes,
    );
  } else {
    storageKey = blobOriginalKey(options.instanceId, fileId, options.filename);
    await writeBlobObject(storageKey, options.bytes, mimeType);
  }

  const record: SessionFileRecord = {
    id: fileId,
    instanceId: options.instanceId,
    agentName: options.agentName,
    filename: options.filename,
    mimeType,
    sizeBytes: options.bytes.length,
    storageBackend: backend,
    storageKey,
    contentCacheKey: null,
    expiresAt: defaultExpiresAt(),
    createdAt: new Date(),
  };
  await insertSessionFile(record);
  try {
    await ensureSessionFileContentCached(options.instanceId, fileId);
  } catch (error) {
    await deleteSessionFile(options.instanceId, fileId);
    throw error;
  }

  const refreshed = await getSessionFile(options.instanceId, fileId);
  return refreshed ?? record;
}

export async function listSessionFileItems(instanceId: string): Promise<SessionFileListItem[]> {
  const records = await listSessionFilesForInstance(instanceId);
  return records.map(toListItem);
}

export async function readSessionFileBytes(
  instanceId: string,
  fileId: string,
): Promise<{ record: SessionFileRecord; bytes: Buffer }> {
  const record = await getSessionFile(instanceId, fileId);
  if (!record) throw new Error(`Session file not found: ${fileId}`);

  if (record.storageBackend === 'local') {
    const bytes = await readLocalFile(record.storageKey);
    return { record, bytes };
  }
  const bytes = await readBlobBytes(record.storageKey);
  return { record, bytes };
}

export async function readSessionFileCachedText(
  instanceId: string,
  fileId: string,
): Promise<string | null> {
  const record = await getSessionFile(instanceId, fileId);
  if (!record?.contentCacheKey) return null;

  if (record.storageBackend === 'local') {
    try {
      const bytes = await readLocalFile(record.contentCacheKey);
      return bytes.toString('utf8');
    } catch {
      return null;
    }
  }
  try {
    return await readBlobText(record.contentCacheKey);
  } catch {
    return null;
  }
}

/** Parse document bytes and persist extracted text for read/search tools. Idempotent. */
export async function ensureSessionFileContentCached(
  instanceId: string,
  fileId: string,
): Promise<void> {
  const existing = await readSessionFileCachedText(instanceId, fileId);
  if (existing !== null) return;

  const record = await getSessionFile(instanceId, fileId);
  if (!record) throw new Error(`Session file not found: ${fileId}`);

  const { bytes } = await readSessionFileBytes(instanceId, fileId);
  const extracted = await extractSessionFileText({
    fileId,
    filename: record.filename,
    mimeType: record.mimeType,
    bytes,
  });
  await writeSessionFileContentCache(instanceId, fileId, extracted.text);
}

export async function writeSessionFileContentCache(
  instanceId: string,
  fileId: string,
  text: string,
): Promise<void> {
  const record = await getSessionFile(instanceId, fileId);
  if (!record) throw new Error(`Session file not found: ${fileId}`);

  let cacheKey: string;
  if (record.storageBackend === 'local') {
    cacheKey = await writeLocalContentCache(instanceId, fileId, text);
  } else {
    cacheKey = blobContentCacheKey(instanceId, fileId);
    await writeBlobText(cacheKey, text);
  }
  await setSessionFileContentCacheKey(instanceId, fileId, cacheKey);
}

export async function deleteSessionFile(instanceId: string, fileId: string): Promise<boolean> {
  const record = await getSessionFile(instanceId, fileId);
  if (!record) return false;

  if (record.storageBackend === 'local') {
    const paths = [record.storageKey];
    if (record.contentCacheKey) paths.push(record.contentCacheKey);
    await deleteLocalPaths(paths);
  } else {
    const keys = [record.storageKey];
    if (record.contentCacheKey) keys.push(record.contentCacheKey);
    await deleteBlobKeys(keys);
  }

  return deleteSessionFileRecord(instanceId, fileId);
}

/** Resolve absolute paths for local content search (testing / search tool). */
export async function listSessionFileRecords(instanceId: string): Promise<SessionFileRecord[]> {
  return listSessionFilesForInstance(instanceId);
}

export function resolveLocalPathsForRecord(record: SessionFileRecord): {
  original: string;
  contentCache: string;
} {
  return {
    original: localOriginalPath(record.instanceId, record.id, record.filename),
    contentCache: localContentCachePath(record.instanceId, record.id),
  };
}
