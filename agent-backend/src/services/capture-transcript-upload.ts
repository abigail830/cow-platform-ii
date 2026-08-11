import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { appAudios, db } from '../db/index.ts';
import { extractSessionFileText } from '../shared/session-file-extract.ts';
import {
  MAX_TRANSCRIPT_UPLOAD_BYTES,
  normalizeTranscriptMarkdown,
  validateTranscriptFilename,
} from './capture-transcript-normalize.ts';
import {
  audioStoragePrefix,
  extensionFromFilename,
  getStorageUploadUrl,
  headStorageObject,
  sha256Hex,
  transcriptS3Key,
  uploadAudioObject,
} from '../storage/audio-files.ts';
import { readStorageBuffer } from '../storage/document-content.ts';
import { attachAudioToCapture } from './audio-captures.ts';

export { MAX_TRANSCRIPT_UPLOAD_BYTES, normalizeTranscriptMarkdown, validateTranscriptFilename } from './capture-transcript-normalize.ts';

export function transcriptStagingS3Key(uploadId: string, filename: string): string {
  const ext = extensionFromFilename(validateTranscriptFilename(filename));
  const key = `audio/staging/${uploadId}/original.${ext}`;
  return key;
}

export function transcriptOriginalS3Key(fileHash: string, filename: string): string {
  const ext = extensionFromFilename(validateTranscriptFilename(filename));
  const key = `${audioStoragePrefix(fileHash)}original.${ext}`;
  return key;
}

export function isTranscriptSourceMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.source_kind === 'transcript';
}

export async function extractTranscriptUploadText(filename: string, buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_TRANSCRIPT_UPLOAD_BYTES) {
    throw new Error('Transcript file exceeds maximum allowed size');
  }
  const ext = extensionFromFilename(filename).toLowerCase();
  const mimeType =
    ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown';
  const result = await extractSessionFileText({ filename, mimeType, bytes: buffer });
  return result.text.trim();
}

async function writeTranscriptSegmentObjects(input: {
  normalizedMarkdown: string;
  originalBuffer: Buffer;
  filename: string;
}): Promise<{ fileHash: string; transcriptKey: string; originalKey: string }> {
  const normalizedMarkdown = input.normalizedMarkdown;
  const fileHash = sha256Hex(Buffer.from(normalizedMarkdown, 'utf8'));
  const transcriptKey = transcriptS3Key(fileHash);
  const originalKey = transcriptOriginalS3Key(fileHash, input.filename);

  await uploadAudioObject(
    transcriptKey,
    Buffer.from(normalizedMarkdown, 'utf8'),
    'text/markdown; charset=utf-8',
  );

  const ext = extensionFromFilename(input.filename).toLowerCase();
  const originalContentType =
    ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown; charset=utf-8';
  await uploadAudioObject(originalKey, input.originalBuffer, originalContentType);

  return { fileHash, transcriptKey, originalKey };
}

export async function createAndAttachTranscriptSegment(input: {
  channelId: string;
  captureId: string;
  filename: string;
  buffer: Buffer;
  uploadedBy: string;
  segmentLabel?: string | null;
}) {
  const filename = validateTranscriptFilename(input.filename);
  const extracted = await extractTranscriptUploadText(filename, input.buffer);
  const normalizedMarkdown = normalizeTranscriptMarkdown(extracted, filename);
  const { fileHash, transcriptKey } = await writeTranscriptSegmentObjects({
    normalizedMarkdown,
    originalBuffer: input.buffer,
    filename,
  });

  const [row] = await db
    .insert(appAudios)
    .values({
      channelId: input.channelId,
      name: filename,
      fileType: 'md',
      sizeBytes: input.buffer.length,
      fileHash,
      s3Key: transcriptKey,
      status: 'completed',
      metadata: {
        source_kind: 'transcript',
        original_filename: filename,
      },
      uploadedBy: input.uploadedBy,
    })
    .returning();

  await attachAudioToCapture({
    captureId: input.captureId,
    audioId: row!.id,
    segmentLabel: input.segmentLabel,
  });

  return row!;
}

export async function initTranscriptSegmentUpload(input: {
  captureId: string;
  filename: string;
  sizeBytes: number;
}) {
  const filename = validateTranscriptFilename(input.filename);
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (input.sizeBytes > MAX_TRANSCRIPT_UPLOAD_BYTES) {
    throw new Error('Transcript file exceeds maximum allowed size');
  }

  const uploadId = randomUUID();
  const stagingKey = transcriptStagingS3Key(uploadId, filename);
  const ext = extensionFromFilename(filename).toLowerCase();
  const contentType =
    ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown';

  const uploadUrl = await getStorageUploadUrl(stagingKey, contentType);
  return {
    upload_id: uploadId,
    skip_upload: false,
    staging_s3_key: stagingKey,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
  };
}

export async function completeTranscriptSegmentUpload(input: {
  channelId: string;
  captureId: string;
  uploadId: string;
  filename: string;
  stagingS3Key: string;
  sizeBytes: number;
  uploadedBy: string;
  segmentLabel?: string | null;
}) {
  const filename = validateTranscriptFilename(input.filename);
  const expectedKey = transcriptStagingS3Key(input.uploadId, filename);
  if (input.stagingS3Key !== expectedKey) {
    throw new Error('staging_s3_key does not match upload_id and filename');
  }

  const head = await headStorageObject(expectedKey);
  if (!head.exists) {
    throw new Error('Uploaded transcript object not found in storage');
  }

  const buffer = await readStorageBuffer(expectedKey);
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded transcript object is empty');
  }

  return createAndAttachTranscriptSegment({
    channelId: input.channelId,
    captureId: input.captureId,
    filename,
    buffer,
    uploadedBy: input.uploadedBy,
    segmentLabel: input.segmentLabel,
  });
}
