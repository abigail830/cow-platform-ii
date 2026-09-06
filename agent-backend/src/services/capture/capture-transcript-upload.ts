import { randomUUID } from 'node:crypto';
import { extractSessionFileText } from '../../shared/session/session-file-extract.ts';
import {
  MAX_TRANSCRIPT_UPLOAD_BYTES,
  normalizeTranscriptMarkdown,
  validateTranscriptFilename,
} from './capture-transcript-normalize.ts';
import {
  audioStoragePrefix,
  extensionFromFilename,
  getStorageUploadUrl,
  sha256Hex,
  transcriptS3Key,
} from '../../storage/audio-files.ts';

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

export async function initTranscriptSegmentUpload(input: {
  captureId: string;
  filename: string;
  sizeBytes: number;
  transcriptMarkdown?: string | null;
}) {
  const filename = validateTranscriptFilename(input.filename);
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (input.sizeBytes > MAX_TRANSCRIPT_UPLOAD_BYTES) {
    throw new Error('Transcript file exceeds maximum allowed size');
  }

  const ext = extensionFromFilename(filename).toLowerCase();
  const inlineMarkdown = input.transcriptMarkdown?.trim();
  const canUseDirectUpload =
    inlineMarkdown &&
    (ext === 'md' || ext === 'markdown' || ext === 'docx');

  if (canUseDirectUpload) {
    const normalized = normalizeTranscriptMarkdown(inlineMarkdown, filename);
    const fileHash = sha256Hex(Buffer.from(normalized, 'utf8'));
    const transcriptKey = transcriptS3Key(fileHash);
    const originalKey = transcriptOriginalS3Key(fileHash, filename);
    const transcriptContentType = 'text/markdown; charset=utf-8';
    const originalContentType =
      ext === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : transcriptContentType;

    return {
      mode: 'direct' as const,
      file_hash: fileHash,
      transcript_s3_key: transcriptKey,
      original_s3_key: originalKey,
      normalized_markdown: normalized,
      transcript_upload_url: await getStorageUploadUrl(transcriptKey, transcriptContentType),
      original_upload_url: await getStorageUploadUrl(originalKey, originalContentType),
      method: 'PUT' as const,
      transcript_headers: { 'Content-Type': transcriptContentType },
      original_headers: { 'Content-Type': originalContentType },
    };
  }

  const uploadId = randomUUID();
  const stagingKey = transcriptStagingS3Key(uploadId, filename);
  const contentType =
    ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown';

  const uploadUrl = await getStorageUploadUrl(stagingKey, contentType);
  return {
    mode: 'staging' as const,
    upload_id: uploadId,
    skip_upload: false,
    staging_s3_key: stagingKey,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
  };
}
