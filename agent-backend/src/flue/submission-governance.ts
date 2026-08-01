import type { AgentSubmission } from '@flue/runtime/adapter';
import { shouldRetainSubmissionOnStartup } from './agent-instance-stream-registry.ts';

type SubmissionStore = {
  listRunningSubmissions(): Promise<AgentSubmission[]>;
  listRunnableSubmissions(): Promise<AgentSubmission[]>;
  requestSessionAbort(sessionKey: string): Promise<string[]>;
};

export type SubmissionGovernanceResult = {
  examined: number;
  aborted: number;
};

function agentNameFromSubmission(submission: AgentSubmission): string {
  return submission.input.agent;
}

function instanceIdFromSubmission(submission: AgentSubmission): string {
  return submission.input.id;
}

/**
 * Abort queued/running submissions for instances that are neither recent nor
 * actively observed by a client. Prevents cold starts from materializing sandboxes
 * for stale background work.
 */
export async function runSubmissionGovernanceAtStartup(options: {
  submissions: SubmissionStore;
  abortInstance: (agentName: string, instanceId: string) => Promise<boolean>;
  now?: number;
}): Promise<SubmissionGovernanceResult> {
  const now = options.now ?? Date.now();
  const running = await options.submissions.listRunningSubmissions();
  const runnable = await options.submissions.listRunnableSubmissions();
  const pending = [...running, ...runnable];

  let aborted = 0;
  for (const submission of pending) {
    const instanceId = instanceIdFromSubmission(submission);
    const agentName = agentNameFromSubmission(submission);
    if (shouldRetainSubmissionOnStartup(instanceId, submission.acceptedAt, now)) continue;

    await options.submissions.requestSessionAbort(submission.sessionKey);
    await options.abortInstance(agentName, instanceId);
    aborted += 1;
  }

  return { examined: pending.length, aborted };
}
