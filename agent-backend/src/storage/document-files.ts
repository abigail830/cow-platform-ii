import { createHash, randomUUID } from 'node:crypto';
import {
  assertStorageClient,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  StorageNotConfiguredError,
} from './s3-client.ts';
import { validateKey } from './prefix-utils.ts';

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
