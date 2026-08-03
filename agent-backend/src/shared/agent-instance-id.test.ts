import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeUserIdFromInstanceId,
  encodeUserIdForInstanceId,
  toAgentInstanceId,
} from './agent-instance-id.ts';

test('decodeUserIdFromInstanceId reverses encoded instance ids', () => {
  const userId = 'user@example.com';
  const instanceId = toAgentInstanceId(userId, 'conv-1');
  assert.equal(instanceId, `${encodeUserIdForInstanceId(userId)}--conv-1`);
  assert.equal(decodeUserIdFromInstanceId(instanceId), userId);
});

test('decodeUserIdFromInstanceId returns null for invalid ids', () => {
  assert.equal(decodeUserIdFromInstanceId('no-separator'), null);
});
