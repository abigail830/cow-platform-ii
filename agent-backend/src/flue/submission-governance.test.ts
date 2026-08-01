import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentSubmission } from '@flue/runtime/adapter';
import { agentInstanceStreamRegistry, SUBMISSION_RECENT_MS } from './agent-instance-stream-registry.ts';
import { runSubmissionGovernanceAtStartup } from './submission-governance.ts';

function makeSubmission(partial: {
  submissionId: string;
  sessionKey: string;
  agent: string;
  instanceId: string;
  acceptedAt: number;
  status: 'queued' | 'running';
}): AgentSubmission {
  return {
    sequence: 1,
    submissionId: partial.submissionId,
    sessionKey: partial.sessionKey,
    kind: 'dispatch',
    input: {
      kind: 'dispatch',
      submissionId: partial.submissionId,
      dispatchId: 'dispatch-1',
      agent: partial.agent,
      id: partial.instanceId,
      input: {},
      acceptedAt: new Date(partial.acceptedAt).toISOString(),
    },
    status: partial.status,
    acceptedAt: partial.acceptedAt,
    canonicalReadyAt: partial.acceptedAt,
    attemptCount: 0,
    maxRetry: 3,
    timeoutAt: partial.acceptedAt + 3_600_000,
    leaseExpiresAt: partial.acceptedAt + 30_000,
  };
}

test('runSubmissionGovernanceAtStartup aborts only stale unsubscribed submissions', async () => {
  agentInstanceStreamRegistry.resetForTests();
  const now = Date.now();
  const stale = makeSubmission({
    submissionId: 'sub-stale',
    sessionKey: 'session-stale',
    agent: 'content-studio',
    instanceId: 'user--stale-conv',
    acceptedAt: now - SUBMISSION_RECENT_MS - 1,
    status: 'running',
  });
  const recent = makeSubmission({
    submissionId: 'sub-recent',
    sessionKey: 'session-recent',
    agent: 'content-studio',
    instanceId: 'user--recent-conv',
    acceptedAt: now - 60_000,
    status: 'queued',
  });

  const abortedKeys: string[] = [];
  const abortedInstances: string[] = [];

  const result = await runSubmissionGovernanceAtStartup({
    submissions: {
      listRunningSubmissions: async () => [stale],
      listRunnableSubmissions: async () => [recent],
      requestSessionAbort: async (sessionKey) => {
        abortedKeys.push(sessionKey);
        return [];
      },
    },
    abortInstance: async (agentName, instanceId) => {
      abortedInstances.push(`${agentName}:${instanceId}`);
      return true;
    },
    now,
  });

  assert.equal(result.examined, 2);
  assert.equal(result.aborted, 1);
  assert.deepEqual(abortedKeys, ['session-stale']);
  assert.deepEqual(abortedInstances, ['content-studio:user--stale-conv']);
});
