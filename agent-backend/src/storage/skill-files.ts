import { createHash } from 'node:crypto';
import { getStorageUploadUrl as getS3UploadUrl } from './document-files.ts';
import { validateKey } from './prefix-utils.ts';

export const SKILLS_UPLOAD_PREFIX = 'skills/uploads/';
export const MAX_SKILL_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_SKILL_EXTRACTED_BYTES = 100 * 1024 * 1024;

const SKILL_ZIP_CONTENT_TYPE = 'application/zip';

export function validateFileHash(fileHash: string): string {
  const normalized = fileHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('file_hash must be a SHA-256 hex string');
  }
  return normalized;
}

export function validateSkillZipFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error('Filename must be 1–512 characters');
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('Filename is invalid');
  }
  if (!trimmed.toLowerCase().endsWith('.zip')) {
    throw new Error('Skill upload must be a .zip file');
  }
  return trimmed;
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
