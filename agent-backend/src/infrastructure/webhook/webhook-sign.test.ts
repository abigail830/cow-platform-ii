import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload } from './webhook-sign.ts';

describe('signWebhookPayload', () => {
  it('is stable for the same body and timestamp', () => {
    const a = signWebhookPayload({ secret: 'whsec_test', timestamp: '1700000000', rawBody: '{"ok":true}' });
    const b = signWebhookPayload({ secret: 'whsec_test', timestamp: '1700000000', rawBody: '{"ok":true}' });
    assert.equal(a, b);
    assert.match(a, /^v1=[0-9a-f]{64}$/);
  });
});
