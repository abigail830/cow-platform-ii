import { createHash, randomUUID } from 'node:crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertStorageClient,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  StorageNotConfiguredError,
} from './s3-client.ts';
import { validateKey } from './prefix-utils.ts';

export const AUDIO_PREFIX = 'audio/';
export const CHUNK_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([
  'm4a',
  'mp3',
  'wav',
  'flac',
  'aac',
  'amr',
  'ogg',
  'opus',
  'webm',
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

export function validateAudioFilename(filename: string): string {
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

export function buildAudioS3Key(fileHash: string, ext: string): string {
  const key = `${AUDIO_PREFIX}${fileHash}/original.${ext}`;
  validateKey(key);
  return key;
}

export function audioStoragePrefix(fileHash: string): string {
  const prefix = `${AUDIO_PREFIX}${fileHash}/`;
  validateKey(prefix);
  return prefix;
}

export function transcriptS3Key(fileHash: string): string {
  const key = `${audioStoragePrefix(fileHash)}transcript.md`;
  validateKey(key);
  return key;
}

export function asrResultS3Key(fileHash: string): string {
  const key = `${audioStoragePrefix(fileHash)}asr_result.json`;
  validateKey(key);
  return key;
}

export function attachmentContentDisposition(filename: string): string {
  const safeFilename = filename.replace(/[^\w.\-() ]/g, '_');
  return `attachment; filename="${safeFilename}"`;
}

export async function uploadAudioObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, config } = assertStorageClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
}

export async function getStorageReadUrl(key: string, expiresIn = 3600): Promise<string> {
  const { client, config } = assertStorageClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn },
  );
}

export async function readStorageText(key: string): Promise<string | null> {
  const { client, config } = assertStorageClient();
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const body = await response.Body?.transformToByteArray();
    if (!body) return null;
    return Buffer.from(body).toString('utf8');
  } catch {
    return null;
  }
}

export async function deleteAudioStorage(fileHash: string, s3Key: string): Promise<void> {
  const { client, config } = assertStorageClient();
  const keys = new Set<string>([s3Key, transcriptS3Key(fileHash), asrResultS3Key(fileHash)]);
  for (const key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    } catch {
      // best-effort cleanup
    }
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
  const session = uploadSessions.get(uploadId);
  if (!session) throw new Error('Upload session not found or expired');
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

  const parts: Buffer[] = [];
  for (let i = 0; i < session.totalChunks; i += 1) {
    const chunk = session.chunks.get(i);
    if (!chunk) throw new Error(`Missing chunk ${i}`);
    parts.push(chunk);
  }

  uploadSessions.delete(uploadId);
  return {
    channelId: session.channelId,
    filename: session.filename,
    contentType: session.contentType,
    buffer: Buffer.concat(parts),
  };
}

export function formatStorageError(error: unknown): string {
  if (error instanceof StorageNotConfiguredError) return 'Object storage is not configured';
  if (error instanceof Error) return error.message;
  return 'Storage operation failed';
}

export { StorageNotConfiguredError };
