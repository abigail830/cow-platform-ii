import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { generateApiKeyPlaintext, hashApiKey } from './api-key.ts';
import { requireSessionAuth, signToken } from './jwt.ts';

before(() => {
  process.env.JWT_SECRET ??= 'test-jwt-secret';
});

describe('requireAuth with API keys', () => {
  it('requireSessionAuth rejects API key tokens', async () => {
    const app = new Hono();
    app.post('/keys', requireSessionAuth, (c) => c.json({ ok: true }));

    const apiKey = generateApiKeyPlaintext();
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    assert.equal(res.status, 401);
  });

  it('requireSessionAuth accepts JWT', async () => {
    const app = new Hono();
    app.post('/keys', requireSessionAuth, (c) => c.json({ ok: true }));

    const jwt = signToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 't@example.com',
      displayName: 'T',
      role: 'admin',
    });
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    assert.equal(res.status, 200);
  });
});

// hash round-trip used by DB layer
describe('api key hash storage contract', () => {
  it('stores sha256 hex of plaintext', () => {
    const key = generateApiKeyPlaintext();
    const hash = hashApiKey(key);
    assert.match(hash, /^[a-f0-9]{64}$/);
  });
});
