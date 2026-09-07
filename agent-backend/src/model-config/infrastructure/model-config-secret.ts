import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Model provider API keys must be recoverable for outbound API calls, so they cannot
 * use one-way hashing (unlike user API keys). We store AES-256-GCM ciphertext in DB.
 */
const ENCRYPTION_PREFIX = 'okfenc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveEncryptionKey(): Buffer {
  const secret =
    process.env.MODEL_CONFIG_SECRET_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'MODEL_CONFIG_SECRET_KEY or JWT_SECRET is required to seal model config API keys',
    );
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function isEncryptedStoredModelApiKey(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

export function hasStoredModelConfigApiKey(stored: string | null | undefined): boolean {
  return Boolean(stored?.trim());
}

export function encryptModelConfigApiKey(plaintext: string | null | undefined): string | null {
  const trimmed = plaintext?.trim();
  if (!trimmed) return null;

  const key = deriveEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64url');
  return `${ENCRYPTION_PREFIX}${payload}`;
}

export function decryptModelConfigApiKey(stored: string | null | undefined): string | null {
  const trimmed = stored?.trim();
  if (!trimmed) return null;

  if (!isEncryptedStoredModelApiKey(trimmed)) {
    return trimmed;
  }

  const payload = trimmed.slice(ENCRYPTION_PREFIX.length);
  const buf = Buffer.from(payload, 'base64url');
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted model config API key payload');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const key = deriveEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Seal plaintext (or legacy ciphertext) for DB storage — never stores raw secrets. */
export function sealModelConfigApiKeyForStorage(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const plaintext = isEncryptedStoredModelApiKey(trimmed)
    ? decryptModelConfigApiKey(trimmed)
    : trimmed;
  if (!plaintext?.trim()) return null;
  return encryptModelConfigApiKey(plaintext);
}
