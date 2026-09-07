import { createHash } from 'node:crypto';
import { getStorageUploadUrl as getS3UploadUrl } from '../../document/infrastructure/document-files.ts';
import { validateKey } from '../../infrastructure/oss/prefix-utils.ts';
import {
  MAX_SKILL_EXTRACTED_BYTES,
  MAX_SKILL_ZIP_BYTES,
  validateSkillZipFilename,
} from '../domain/skill-limits.ts';

export { MAX_SKILL_EXTRACTED_BYTES, MAX_SKILL_ZIP_BYTES, validateSkillZipFilename } from '../domain/skill-limits.ts';

export const SKILLS_UPLOAD_PREFIX = 'skills/uploads/';

const SKILL_ZIP_CONTENT_TYPE = 'application/zip';

export function validateFileHash(fileHash: string): string {
  const normalized = fileHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('file_hash must be a SHA-256 hex string');
  }
  return normalized;
}

export function buildSkillUploadS3Key(fileHash: string): string {
  const key = `${SKILLS_UPLOAD_PREFIX}${fileHash}.zip`;
  validateKey(key);
  return key;
}

export async function getSkillZipUploadUrl(fileHash: string): Promise<string> {
  return getS3UploadUrl(buildSkillUploadS3Key(fileHash), SKILL_ZIP_CONTENT_TYPE);
}

export function sha256HexBuffer(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
