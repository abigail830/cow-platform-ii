import {
  buildSkillUploadS3Key,
  getSkillZipUploadUrl,
  MAX_SKILL_ZIP_BYTES,
  validateFileHash,
  validateSkillZipFilename,
} from '../../storage/skill-files.ts';

/** Mint a presigned PUT URL. Signing is local — do not HEAD OSS here. */
export async function initSkillUpload(input: {
  filename: string;
  fileHash: string;
  sizeBytes: number;
}) {
  const filename = validateSkillZipFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const sizeBytes = input.sizeBytes;

  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (sizeBytes > MAX_SKILL_ZIP_BYTES) {
    throw new Error('ZIP exceeds maximum allowed size');
  }

  const s3Key = buildSkillUploadS3Key(fileHash);
  const uploadUrl = await getSkillZipUploadUrl(fileHash);
  return {
    s3_key: s3Key,
    file_hash: fileHash,
    filename,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': 'application/zip' },
    skip_upload: false,
  };
}

export function validateSkillUploadComplete(input: {
  filename: string;
  fileHash: string;
  s3Key: string;
  sizeBytes: number;
}) {
  const filename = validateSkillZipFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const sizeBytes = input.sizeBytes;
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (sizeBytes > MAX_SKILL_ZIP_BYTES) {
    throw new Error('ZIP exceeds maximum allowed size');
  }
  const expectedKey = buildSkillUploadS3Key(fileHash);
  if (input.s3Key.trim() !== expectedKey) {
    throw new Error('s3_key does not match file_hash');
  }
  return { filename, fileHash, s3Key: expectedKey, sizeBytes };
}
