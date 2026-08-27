import { randomUUID } from 'node:crypto';
import {
  extensionFromFilename,
  fileTypeFromExtension,
  guessAudioContentType,
  validateFileHash,
} from './audio-files.ts';
import {
  assertStorageClient,
  DeleteObjectCommand,
} from './s3-client.ts';
import { getStorageReadUrl, getStorageUploadUrl } from './document-files.ts';
import { validateKey } from './prefix-utils.ts';

export const EVAL_DATASETS_PREFIX = 'datasets/';
export const MAX_EVAL_DATASET_ITEM_BYTES = 500 * 1024 * 1024;
export const MAX_EVAL_DATASET_REFERENCE_BYTES = 10 * 1024 * 1024;
export const EVAL_DATASET_REFERENCE_FILENAME = 'transcript.txt';

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

export function validateEvalDatasetFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error('Filename must be 1–512 characters');
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('Invalid filename');
  }
  const ext = extensionFromFilename(trimmed);
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

export function buildEvalDatasetReferenceS3Key(datasetId: string, itemId: string): string {
  const key = `${EVAL_DATASETS_PREFIX}${datasetId}/items/${itemId}/reference/${EVAL_DATASET_REFERENCE_FILENAME}`;
  validateKey(key);
  return key;
}

export function guessEvalDatasetReferenceContentType(): string {
  return 'text/plain; charset=utf-8';
}

export function newEvalDatasetItemId(): string {
  return randomUUID();
}

export function guessEvalDatasetContentType(ext: string): string {
  if (ext === 'mp4') return 'video/mp4';
  return guessAudioContentType(ext);
}

export { extensionFromFilename, fileTypeFromExtension, validateFileHash };

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
