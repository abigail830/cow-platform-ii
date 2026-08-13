import {
  buildDocumentS3Key,
  extensionFromFilename,
  getStorageUploadUrl,
  guessDocumentContentType,
  headStorageObject,
  MAX_DOCUMENT_BYTES,
  validateDocumentFilename,
  validateFileHash,
} from '../storage/document-files.ts';

export async function initDocumentUpload(input: {
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

  const head = await headStorageObject(s3Key);
  if (head.exists && head.size === sizeBytes) {
    return {
      s3_key: s3Key,
      file_hash: fileHash,
      skip_upload: true,
    };
  }

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
