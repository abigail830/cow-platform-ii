import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentInstanceStreamRegistry,
  shouldRetainSubmissionOnStartup,
  SUBMISSION_RECENT_MS,
} from './agent-instance-stream-registry.ts';

test('shouldRetainSubmissionOnStartup keeps recent submissions', () => {
  agentInstanceStreamRegistry.resetForTests();
  const now = Date.now();
  const instanceId = 'user--conv-recent';
  assert.equal(
    shouldRetainSubmissionOnStartup(instanceId, now - SUBMISSION_RECENT_MS + 1000, now),
    true,
  );
});

test('shouldRetainSubmissionOnStartup drops stale submissions without subscribers', () => {
  agentInstanceStreamRegistry.resetForTests();
  const now = Date.now();
  const instanceId = 'user--conv-stale';
  assert.equal(
    shouldRetainSubmissionOnStartup(instanceId, now - SUBMISSION_RECENT_MS - 1, now),
    false,
  );
});

test('shouldRetainSubmissionOnStartup keeps stale submissions when client is subscribed', () => {
  agentInstanceStreamRegistry.resetForTests();
  const now = Date.now();
  const instanceId = 'user--conv-live';
  agentInstanceStreamRegistry.addSubscriber(instanceId);
  assert.equal(
    shouldRetainSubmissionOnStartup(instanceId, now - SUBMISSION_RECENT_MS - 60_000, now),
    true,
  );
});
