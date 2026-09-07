export const MAX_SKILL_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_SKILL_EXTRACTED_BYTES = 100 * 1024 * 1024;

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
