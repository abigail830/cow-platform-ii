import {
  extensionFromFilename,
  fileTypeFromExtension,
  guessDocumentContentType,
  validateDocumentFilename,
  validateFileHash,
} from './document-files.ts';
import {
  extensionFromFilename as audioExtensionFromFilename,
  fileTypeFromExtension as audioFileTypeFromExtension,
  guessAudioContentType,
} from './audio-files.ts';
import type { EvalMediaType } from '../db/schema.ts';
import {
  assertStorageClient,
  DeleteObjectCommand,
} from './s3-client.ts';
import { getStorageReadUrl, getStorageUploadUrl } from './document-files.ts';
import { validateKey } from './prefix-utils.ts';
import { randomUUID } from 'node:crypto';

export const EVAL_DATASETS_PREFIX = 'datasets/';
export const MAX_EVAL_DATASET_ITEM_BYTES = 500 * 1024 * 1024;

const ACCEPTED_AUDIO_EXTENSIONS = new Set([
  'm4a',
  'mp3',
  'wav',
  'flac',
  'aac',
  'amr',
  'ogg',
  'opus',
  'webm',
  'mp4',
]);

const ACCEPTED_DOCUMENT_EXTENSIONS = new Set([
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

export function acceptedExtensionsForEvalMediaType(mediaType: EvalMediaType): Set<string> {
  return mediaType === 'document' ? ACCEPTED_DOCUMENT_EXTENSIONS : ACCEPTED_AUDIO_EXTENSIONS;
}

export function validateEvalDatasetFilename(filename: string, mediaType: EvalMediaType = 'audio'): string {
  if (mediaType === 'document') {
    return validateDocumentFilename(filename);
  }

  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error('Filename must be 1–512 characters');
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('Invalid filename');
  }
  const ext = audioExtensionFromFilename(trimmed);
  if (!ext || !ACCEPTED_AUDIO_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file type. Accepted: ${[...ACCEPTED_AUDIO_EXTENSIONS].sort().join(', ')}`,
    );
  }
  return trimmed;
}

export function buildEvalDatasetItemS3Key(
  datasetId: string,
  itemId: string,
  ext: string,
): string {
  const key = `${EVAL_DATASETS_PREFIX}${datasetId}/items/${itemId}/input/original.${ext}`;
  validateKey(key);
  return key;
}

export function newEvalDatasetItemId(): string {
  return randomUUID();
}

export function guessEvalDatasetContentType(ext: string, mediaType: EvalMediaType = 'audio'): string {
  if (mediaType === 'document') {
    return guessDocumentContentType(ext);
  }
  if (ext === 'mp4') return 'video/mp4';
  return guessAudioContentType(ext);
}

export function evalDatasetFileTypeFromExtension(ext: string, mediaType: EvalMediaType = 'audio'): string {
  return mediaType === 'document'
    ? fileTypeFromExtension(ext)
    : audioFileTypeFromExtension(ext);
}

export { extensionFromFilename, validateFileHash };

export async function getEvalDatasetItemReadUrl(key: string): Promise<string> {
  validateKey(key);
  return getStorageReadUrl(key, 3600);
}

export async function getEvalDatasetItemUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  validateKey(key);
  return getStorageUploadUrl(key, contentType, 3600);
}

export async function deleteEvalDatasetStorageObject(key: string): Promise<void> {
  validateKey(key);
  const { client, config } = assertStorageClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}
