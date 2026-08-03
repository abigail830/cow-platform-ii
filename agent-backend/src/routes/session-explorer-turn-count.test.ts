import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flueSubmissionSessionKeyPrefix } from './session-explorer-turn-count.ts';

test('flueSubmissionSessionKeyPrefix matches Flue session_key layout', () => {
  const instanceId = 'user-uuid--conversation-uuid';
  assert.equal(
    flueSubmissionSessionKeyPrefix(instanceId),
    'agent-session:["user-uuid--conversation-uuid",',
  );
  assert.ok(
    `agent-session:["${instanceId}","default","default"]`.startsWith(
      flueSubmissionSessionKeyPrefix(instanceId),
    ),
  );
});
