import type { AgentStatus } from '@flue/react';

export function isAgentBusy(status: AgentStatus): boolean {
  return status === 'connecting' || status === 'submitted' || status === 'streaming';
}
