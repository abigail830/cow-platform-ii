import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const API_KEY_PREFIX = 'okf_';
export const API_KEY_PREFIX_DISPLAY_LENGTH = 12;

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX) && token.length > API_KEY_PREFIX.length + 8;
}

export function generateApiKeyPlaintext(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function apiKeyLookupPrefix(plaintext: string): string {
  if (!isApiKeyToken(plaintext)) {
    throw new Error('Invalid API key format');
  }
  return plaintext.slice(0, API_KEY_PREFIX_DISPLAY_LENGTH);
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function verifyApiKeyHash(plaintext: string, storedHash: string): boolean {
  try {
    const a = Buffer.from(hashApiKey(plaintext), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
