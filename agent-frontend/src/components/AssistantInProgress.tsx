import type { AgentStatus } from '@flue/react';
import { inProgressStatusLabel } from '../chat/assistant-turn.ts';
import { TypingIndicator } from './TypingIndicator.tsx';

type AssistantInProgressProps = {
  status: AgentStatus;
};

export function AssistantInProgress({ status }: AssistantInProgressProps) {
  return (
    <div className="assistant-in-progress">
      <TypingIndicator />
      <span className="assistant-in-progress-label">{inProgressStatusLabel(status)}</span>
    </div>
  );
}
