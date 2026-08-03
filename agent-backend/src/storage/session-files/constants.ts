export const SESSION_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const SESSION_FILE_MAX_PER_INSTANCE = 10;
export const SESSION_FILE_READ_MAX_CHARS = 2_000_000;
export const SESSION_FILE_DEFAULT_TTL_DAYS = 30;

export const SESSION_FILE_EXTENSIONS = new Set([
  'md',
  'markdown',
  'txt',
  'csv',
  'docx',
  'xlsx',
  'xls',
  'pptx',
  'pdf',
]);

export function extensionFromFilename(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}

export function isAllowedSessionFile(filename: string): boolean {
  const ext = extensionFromFilename(filename);
  return SESSION_FILE_EXTENSIONS.has(ext);
}

export function mimeTypeForSessionFile(filename: string): string {
  const ext = extensionFromFilename(filename);
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim().replace(/[/\\]/g, '_').replace(/\.\./g, '_');
  return trimmed.slice(0, 200) || 'file';
}
