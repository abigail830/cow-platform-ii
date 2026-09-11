export const FILE_TEXT_READ_MAX_CHARS = 2_000_000;

export const FILE_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export const FILE_TEXT_EXTENSIONS = new Set([
  'md',
  'markdown',
  'txt',
  'csv',
  'docx',
  'xlsx',
  'xls',
  'pptx',
  'pdf',
  ...FILE_IMAGE_EXTENSIONS,
]);

export function isFileImage(filename: string): boolean {
  return FILE_IMAGE_EXTENSIONS.has(extensionFromFilename(filename));
}

export function extensionFromFilename(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}
