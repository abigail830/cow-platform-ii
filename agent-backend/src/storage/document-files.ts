import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertStorageClient,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  StorageNotConfiguredError,
} from './s3-client.ts';
import { validateKey } from './prefix-utils.ts';
import { readStorageStream } from './document-content.ts';

export const DOCUMENTS_PREFIX = 'documents/';
export const CHUNK_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'docx',
  'pptx',
  'xlsx',
  'epub',
  'xmind',
  'md',
  'markdown',
]);

type UploadSession = {
  channelId: string;
  filename: string;
  contentType: string;
  totalChunks: number;
  chunks: Map<number, Buffer>;
  createdAt: number;
};

const uploadSessions = new Map<string, UploadSession>();
const SESSION_TTL_MS = 60 * 60 * 1000;

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of uploadSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) uploadSessions.delete(id);
  }
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function extensionFromFilename(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}

export function fileTypeFromExtension(ext: string): string {
  return ext ? ext.toUpperCase() : 'UNKNOWN';
}

export function validateDocumentFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error('Filename must be 1–512 characters');
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('Filename is invalid');
  }
  const ext = extensionFromFilename(trimmed);
  if (!ACCEPTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file type. Accepted: ${[...ACCEPTED_EXTENSIONS].map((e) => `.${e}`).join(', ')}`,
    );
  }
  return trimmed;
}

export function buildDocumentS3Key(fileHash: string, ext: string): string {
  const key = `${DOCUMENTS_PREFIX}${fileHash}/original.${ext}`;
  validateKey(key);
  return key;
}

export function documentStoragePrefix(fileHash: string): string {
  const prefix = `${DOCUMENTS_PREFIX}${fileHash}/`;
  validateKey(prefix);
  return prefix;
}

export function archiveFilenameFromDocumentName(filename: string): string {
  const trimmed = filename.trim() || 'document';
  const withoutExt = trimmed.includes('.') ? trimmed.replace(/\.[^.]+$/, '') : trimmed;
  const safe = withoutExt.replace(/[^\w.\-() ]/g, '_').trim() || 'document';
  return `${safe.slice(0, 200)}.zip`;
}

export function attachmentContentDisposition(filename: string): string {
  const safeFilename = filename.replace(/[^\w.\-() ]/g, '_');
  return `attachment; filename="${safeFilename}"`;
}

export function documentStoragePrefixes(fileHash: string): string[] {
  return [documentStoragePrefix(fileHash), `${fileHash}/`];
}

function relativeStoragePath(key: string, fileHash: string): string | null {
  for (const prefix of documentStoragePrefixes(fileHash)) {
    if (key.startsWith(prefix) && key.length > prefix.length && !key.endsWith('/')) {
      return key.slice(prefix.length);
    }
  }
  return null;
}

export async function listDocumentStorageKeys(fileHash: string): Promise<string[]> {
  const keys = new Set<string>();
  for (const prefix of documentStoragePrefixes(fileHash)) {
    for (const key of await listKeysUnderPrefix(prefix)) {
      keys.add(key);
    }
  }
  return [...keys];
}

function appendStreamToArchive(
  archive: archiver.Archiver,
  stream: Readable,
  name: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      stream.off('error', fail);
      stream.off('end', done);
      stream.off('close', done);
      archive.off('error', fail);
    };

    stream.once('error', fail);
    archive.once('error', fail);
    stream.once('end', done);
    stream.once('close', done);
    archive.append(stream, { name });
  });
}

async function populateDocumentBundleArchive(
  archive: archiver.Archiver,
  fileHash: string,
  objectKeys: string[],
): Promise<void> {
  for (const key of objectKeys) {
    const relativePath = relativeStoragePath(key, fileHash);
    if (!relativePath) continue;

    const stream = await readStorageStream(key);
    if (!stream) continue;
    await appendStreamToArchive(archive, stream, relativePath);
  }

  await archive.finalize();
}

/** Lists keys first (fast validation), then streams each object into the ZIP without buffering the whole bundle. */
export async function createDocumentBundleArchive(fileHash: string): Promise<Readable> {
  const keys = await listDocumentStorageKeys(fileHash);
  const objectKeys = keys.filter((key) => relativeStoragePath(key, fileHash) !== null);

  if (objectKeys.length === 0) {
    throw new Error('No stored artifacts found for this document');
  }

  const archive = archiver('zip', { zlib: { level: 5 } });
  void populateDocumentBundleArchive(archive, fileHash, objectKeys).catch((error: unknown) => {
    archive.emit('error', error instanceof Error ? error : new Error('Bundle download failed'));
    archive.abort();
  });

  return archive;
}

export function formatStorageError(error: unknown): string {
  if (!(error instanceof Error)) return 'Storage operation failed';
  const message = error.message;
  if (message.includes('socket did not establish a connection')) {
    return 'Could not connect to object storage. Check network connectivity and storage configuration.';
  }
  if (/timeout/i.test(message)) {
    return 'Object storage request timed out. Please try again.';
  }
  return message;
}

/** Presigned GET for parsed artifacts (markdown, page_index, etc.) — signing is local, no OSS round-trip. */
export async function getStorageReadUrl(key: string, expiresIn = 900): Promise<string> {
  const { client, config } = assertStorageClient();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function getDocumentDownloadUrl(
  s3Key: string,
  filename: string,
  expiresIn = 900,
): Promise<string> {
  const { client, config } = assertStorageClient();
  const safeFilename = filename.replace(/[^\w.\-() ]/g, '_');
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: s3Key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function uploadDocumentObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { client, config } = assertStorageClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
}

async function listKeysUnderPrefix(prefix: string): Promise<string[]> {
  const { client, config } = assertStorageClient();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const entry of response.Contents ?? []) {
      if (entry.Key) keys.push(entry.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

export async function deleteDocumentStorage(fileHash: string): Promise<void> {
  const { client, config } = assertStorageClient();
  const prefixes = [`${DOCUMENTS_PREFIX}${fileHash}/`, `${fileHash}/`];
  const keys = new Set<string>();

  for (const prefix of prefixes) {
    for (const key of await listKeysUnderPrefix(prefix)) {
      keys.add(key);
    }
  }

  for (const key of keys) {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
  }
}

export function createChunkUploadSession(input: {
  channelId: string;
  filename: string;
  contentType: string;
  totalChunks: number;
}): string {
  cleanupExpiredSessions();
  const uploadId = randomUUID();
  uploadSessions.set(uploadId, {
    channelId: input.channelId,
    filename: input.filename,
    contentType: input.contentType,
    totalChunks: input.totalChunks,
    chunks: new Map(),
    createdAt: Date.now(),
  });
  return uploadId;
}

export function storeUploadChunk(uploadId: string, chunkIndex: number, data: Buffer): UploadSession {
  cleanupExpiredSessions();
  const session = uploadSessions.get(uploadId);
  if (!session) throw new Error('Upload session not found or expired');
  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new Error('Invalid chunk index');
  }
  session.chunks.set(chunkIndex, data);
  return session;
}

export function assembleUploadSession(uploadId: string): {
  channelId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
} {
  const session = uploadSessions.get(uploadId);
  if (!session) throw new Error('Upload session not found or expired');
  if (session.chunks.size !== session.totalChunks) {
    throw new Error('Not all chunks have been uploaded');
  }

  const parts: Buffer[] = [];
  let totalSize = 0;
  for (let index = 0; index < session.totalChunks; index += 1) {
    const chunk = session.chunks.get(index);
    if (!chunk) throw new Error('Missing chunk data');
    totalSize += chunk.length;
    parts.push(chunk);
  }

  if (totalSize > MAX_DOCUMENT_BYTES) {
    uploadSessions.delete(uploadId);
    throw new Error('File exceeds maximum allowed size');
  }

  const buffer = Buffer.concat(parts);
  uploadSessions.delete(uploadId);
  return {
    channelId: session.channelId,
    filename: session.filename,
    contentType: session.contentType,
    buffer,
  };
}

export { StorageNotConfiguredError };
