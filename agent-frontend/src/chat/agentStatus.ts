import type { AgentStatus } from '@flue/react';

/** Matches Flue demo chat-view: composer busy while a submission is in flight. */
export function isAgentBusy(status: AgentStatus): boolean {
  return status === 'submitted' || status === 'streaming';
}
