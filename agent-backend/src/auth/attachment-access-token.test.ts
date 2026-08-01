import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signAttachmentAccessToken,
  verifyAttachmentAccessToken,
} from './attachment-access-token.ts';

test('attachment access token verifies matching claims', () => {
  process.env.JWT_SECRET = 'test-secret';

  const claims = {
    agentName: 'content-studio',
    instanceId: 'conv--sub',
    attachmentId: 'file-1',
  };

  const token = signAttachmentAccessToken(claims);
  assert.equal(verifyAttachmentAccessToken(token, claims), true);
  assert.equal(
    verifyAttachmentAccessToken(token, { ...claims, attachmentId: 'other' }),
    false,
  );
});
