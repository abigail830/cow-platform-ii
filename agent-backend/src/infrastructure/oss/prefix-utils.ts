const MAX_KEY_LENGTH = 2048;
const MAX_FOLDER_NAME_LENGTH = 200;

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) return '';
  if (trimmed.includes('..')) {
    throw new StorageValidationError('Prefix must not contain ".."');
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function validateKey(key: string): void {
  if (!key || key.length > MAX_KEY_LENGTH) {
    throw new StorageValidationError('Key is invalid or too long');
  }
  if (key.includes('..')) {
    throw new StorageValidationError('Key must not contain ".."');
  }
}

export function validateFolderName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_FOLDER_NAME_LENGTH) {
    throw new StorageValidationError('Folder name must be 1–200 characters');
  }
  if (trimmed.includes('/') || trimmed.includes('..')) {
    throw new StorageValidationError('Folder name must not contain "/" or ".."');
  }
}

export function joinPrefix(parentPrefix: string, segment: string): string {
  const parent = normalizePrefix(parentPrefix);
  const segmentNormalized = segment.endsWith('/') ? segment : `${segment}/`;
  return `${parent}${segmentNormalized}`;
}

export function basenameFromKey(key: string): string {
  const withoutTrailing = key.endsWith('/') ? key.slice(0, -1) : key;
  const idx = withoutTrailing.lastIndexOf('/');
  return idx >= 0 ? withoutTrailing.slice(idx + 1) : withoutTrailing;
}

export function destinationKeyForObject(destinationPrefix: string, sourceKey: string): string {
  const dest = normalizePrefix(destinationPrefix);
  return `${dest}${basenameFromKey(sourceKey)}`;
}

export function destinationPrefixForFolder(destinationPrefix: string, sourcePrefix: string): string {
  const dest = normalizePrefix(destinationPrefix);
  const folderName = basenameFromKey(normalizePrefix(sourcePrefix));
  return `${dest}${folderName}/`;
}
