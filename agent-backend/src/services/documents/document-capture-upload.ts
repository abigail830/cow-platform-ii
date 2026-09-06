import { randomUUID } from 'node:crypto';
import {
  buildDocumentS3Key,
  extensionFromFilename,
  fileTypeFromExtension,
  getStorageUploadUrl,
  guessDocumentContentType,
  MAX_DOCUMENT_BYTES,
  validateDocumentFilename,
  validateFileHash,
} from '../../storage/document-files.ts';
import {
  buildAudioS3Key,
  getStorageUploadUrl as getAudioStorageUploadUrl,
  guessAudioContentType,
  MAX_AUDIO_BYTES,
  validateAudioFilename,
} from '../../storage/audio-files.ts';
import {
  initTranscriptSegmentUpload,
  completeTranscriptSegmentDirectUpload,
  completeTranscriptSegmentUpload,
  validateTranscriptFilename,
  MAX_TRANSCRIPT_UPLOAD_BYTES,
  normalizeTranscriptMarkdown,
  transcriptStagingS3Key,
  transcriptOriginalS3Key,
} from '../capture/capture-transcript-upload.ts';
import { sha256Hex } from '../../storage/document-files.ts';
import { transcriptS3Key } from '../../storage/audio-files.ts';
import { createDocumentCaptureSegment } from './document-captures.ts';

export async function initDocumentCaptureSegmentUpload(input: {
  filename: string;
  fileHash: string;
  sizeBytes: number;
  contentType?: string;
}) {
  const filename = validateDocumentFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const sizeBytes = input.sizeBytes;

  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }

  const ext = extensionFromFilename(filename);
  const s3Key = buildDocumentS3Key(fileHash, ext);
  const contentType = input.contentType?.trim() || guessDocumentContentType(ext);
  const uploadUrl = await getStorageUploadUrl(s3Key, contentType);
  return {
    s3_key: s3Key,
    file_hash: fileHash,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
    skip_upload: false,
  };
}

export async function initDocumentCaptureAudioSegmentUpload(input: {
  filename: string;
  fileHash: string;
  sizeBytes: number;
  contentType?: string;
}) {
  const filename = validateAudioFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const sizeBytes = input.sizeBytes;

  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (sizeBytes > MAX_AUDIO_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }

  const ext = extensionFromFilename(filename);
  const s3Key = buildAudioS3Key(fileHash, ext);
  const contentType = input.contentType?.trim() || guessAudioContentType(ext);
  const uploadUrl = await getAudioStorageUploadUrl(s3Key, contentType);
  return {
    s3_key: s3Key,
    file_hash: fileHash,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
    skip_upload: false,
  };
}

export {
  initTranscriptSegmentUpload,
  completeTranscriptSegmentDirectUpload,
  completeTranscriptSegmentUpload,
  validateTranscriptFilename,
  MAX_TRANSCRIPT_UPLOAD_BYTES,
  normalizeTranscriptMarkdown,
  transcriptOriginalS3Key,
  transcriptStagingS3Key,
};

export async function completeDocumentCaptureSegmentDirectUpload(input: {
  channelId: string;
  captureId: string;
  filename: string;
  fileHash: string;
  s3Key: string;
  sizeBytes: number;
  uploadedBy: string;
  segmentLabel?: string | null;
}) {
  const filename = validateDocumentFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const ext = extensionFromFilename(filename);
  const expectedKey = buildDocumentS3Key(fileHash, ext);
  if (input.s3Key !== expectedKey) {
    throw new Error('s3_key does not match file_hash and filename');
  }

  return createDocumentCaptureSegment({
    channelId: input.channelId,
    captureId: input.captureId,
    name: filename,
    fileType: fileTypeFromExtension(ext),
    sizeBytes: input.sizeBytes,
    fileHash,
    s3Key: expectedKey,
    uploadedBy: input.uploadedBy,
    segmentLabel: input.segmentLabel,
  });
}

export async function completeDocumentCaptureAudioSegmentDirectUpload(input: {
  channelId: string;
  captureId: string;
  filename: string;
  fileHash: string;
  s3Key: string;
  sizeBytes: number;
  uploadedBy: string;
  segmentLabel?: string | null;
}) {
  const filename = validateAudioFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const ext = extensionFromFilename(filename);
  const expectedKey = buildAudioS3Key(fileHash, ext);
  if (input.s3Key !== expectedKey) {
    throw new Error('s3_key does not match file_hash and filename');
  }

  return createDocumentCaptureSegment({
    channelId: input.channelId,
    captureId: input.captureId,
    name: filename,
    fileType: fileTypeFromExtension(ext),
    sizeBytes: input.sizeBytes,
    fileHash,
    s3Key: expectedKey,
    uploadedBy: input.uploadedBy,
    segmentLabel: input.segmentLabel,
  });
}

export async function completeDocumentCaptureTranscriptSegmentDirectUpload(input: {
  channelId: string;
  captureId: string;
  filename: string;
  fileHash: string;
  transcriptS3Key: string;
  sizeBytes: number;
  uploadedBy: string;
  segmentLabel?: string | null;
}) {
  const filename = validateTranscriptFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const expectedKey = transcriptS3Key(fileHash);
  if (input.transcriptS3Key !== expectedKey) {
    throw new Error('transcript_s3_key does not match file_hash');
  }

  return createDocumentCaptureSegment({
    channelId: input.channelId,
    captureId: input.captureId,
    name: filename,
    fileType: 'md',
    sizeBytes: input.sizeBytes,
    fileHash,
    s3Key: expectedKey,
    uploadedBy: input.uploadedBy,
    segmentLabel: input.segmentLabel,
    status: 'completed',
    metadata: {
      source_kind: 'transcript',
      original_filename: filename,
    },
  });
}

export async function initDocumentCaptureTranscriptSegmentUpload(input: {
  captureId: string;
  filename: string;
  sizeBytes: number;
  transcriptMarkdown?: string | null;
}) {
  return initTranscriptSegmentUpload(input);
}

export async function completeDocumentCaptureTranscriptSegmentUpload(input: {
  channelId: string;
  captureId: string;
  uploadId: string;
  filename: string;
  stagingS3Key: string;
  sizeBytes: number;
  uploadedBy: string;
  segmentLabel?: string | null;
  transcriptMarkdown?: string | null;
}) {
  const filename = validateTranscriptFilename(input.filename);
  const expectedKey = transcriptStagingS3Key(input.uploadId, filename);
  if (input.stagingS3Key !== expectedKey) {
    throw new Error('staging_s3_key does not match upload_id and filename');
  }

  const inline = input.transcriptMarkdown?.trim();
  if (!inline) {
    throw new Error(
      'transcript_markdown is required; use direct upload so the browser PUTs to OSS',
    );
  }
  if (Buffer.byteLength(inline, 'utf8') > MAX_TRANSCRIPT_UPLOAD_BYTES) {
    throw new Error('Transcript file exceeds maximum allowed size');
  }

  const normalized = normalizeTranscriptMarkdown(inline, filename);
  const fileHash = sha256Hex(Buffer.from(normalized, 'utf8'));

  return createDocumentCaptureSegment({
    channelId: input.channelId,
    captureId: input.captureId,
    name: filename,
    fileType: 'md',
    sizeBytes: input.sizeBytes,
    fileHash,
    s3Key: transcriptS3Key(fileHash),
    uploadedBy: input.uploadedBy,
    segmentLabel: input.segmentLabel,
    status: 'completed',
    metadata: {
      source_kind: 'transcript',
      original_filename: filename,
    },
  });
}
