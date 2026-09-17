import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeWebhookUrl } from './webhook-url.ts';

describe('assertSafeWebhookUrl', () => {
  it('accepts public https', () => {
    assert.equal(
      assertSafeWebhookUrl('https://example.com/hooks/openkms'),
      'https://example.com/hooks/openkms',
    );
  });

  it('rejects http, localhost, and private IPs', () => {
    assert.throws(() => assertSafeWebhookUrl('http://example.com/x'), /https/);
    assert.throws(() => assertSafeWebhookUrl('https://localhost/x'), /not allowed/);
    assert.throws(() => assertSafeWebhookUrl('https://127.0.0.1/x'), /not allowed/);
    assert.throws(() => assertSafeWebhookUrl('https://10.0.0.8/x'), /not allowed/);
    assert.throws(() => assertSafeWebhookUrl('https://169.254.169.254/latest'), /not allowed/);
  });
});
