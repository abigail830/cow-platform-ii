import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY_PREFIX,
  apiKeyLookupPrefix,
  generateApiKeyPlaintext,
  hashApiKey,
  isApiKeyToken,
  verifyApiKeyHash,
} from './api-key.ts';

describe('api-key', () => {
  it('generateApiKeyPlaintext uses okf_ prefix and sufficient entropy', () => {
    const key = generateApiKeyPlaintext();
    assert.ok(key.startsWith(API_KEY_PREFIX));
    assert.ok(isApiKeyToken(key));
    assert.ok(key.length > API_KEY_PREFIX.length + 20);
  });

  it('apiKeyLookupPrefix returns stable display prefix', () => {
    const key = generateApiKeyPlaintext();
    assert.equal(apiKeyLookupPrefix(key), key.slice(0, 12));
  });

  it('verifyApiKeyHash accepts matching hash only', () => {
    const key = generateApiKeyPlaintext();
    const hash = hashApiKey(key);
    assert.equal(verifyApiKeyHash(key, hash), true);
    assert.equal(verifyApiKeyHash(`${key}x`, hash), false);
    assert.equal(verifyApiKeyHash(key, hashApiKey(generateApiKeyPlaintext())), false);
  });

  it('isApiKeyToken rejects JWT-like tokens', () => {
    assert.equal(isApiKeyToken('eyJhbGciOiJIUzI1NiJ9'), false);
    assert.equal(isApiKeyToken('okf_short'), false);
    assert.equal(isApiKeyToken(generateApiKeyPlaintext()), true);
  });
});
