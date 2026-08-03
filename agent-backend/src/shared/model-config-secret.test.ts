import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptModelConfigApiKey,
  encryptModelConfigApiKey,
  isEncryptedStoredModelApiKey,
  sealModelConfigApiKeyForStorage,
} from './model-config-secret.ts';

describe('model-config-secret', () => {
  const prevSecret = process.env.MODEL_CONFIG_SECRET_KEY;
  const prevJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.MODEL_CONFIG_SECRET_KEY = 'test-model-config-secret';
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.MODEL_CONFIG_SECRET_KEY;
    else process.env.MODEL_CONFIG_SECRET_KEY = prevSecret;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it('encrypts and decrypts API keys', () => {
    const sealed = encryptModelConfigApiKey('sk-live-test-key');
    assert.ok(sealed);
    assert.ok(isEncryptedStoredModelApiKey(sealed!));
    assert.equal(decryptModelConfigApiKey(sealed), 'sk-live-test-key');
  });

  it('returns legacy plaintext unchanged on decrypt', () => {
    assert.equal(decryptModelConfigApiKey('plain-legacy-key'), 'plain-legacy-key');
  });

  it('sealModelConfigApiKeyForStorage does not double-encrypt ciphertext', () => {
    const once = sealModelConfigApiKeyForStorage('provider-key-123');
    const twice = sealModelConfigApiKeyForStorage(once);
    assert.equal(decryptModelConfigApiKey(twice), 'provider-key-123');
  });

  it('sealModelConfigApiKeyForStorage returns null for empty input', () => {
    assert.equal(sealModelConfigApiKeyForStorage(''), null);
    assert.equal(sealModelConfigApiKeyForStorage(null), null);
  });
});
