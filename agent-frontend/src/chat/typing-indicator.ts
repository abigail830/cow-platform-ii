import type { AgentStatus, FlueConversationMessage } from '@flue/react';
import { isAgentBusy } from './agentStatus.ts';
import { latestTurnAssistantMessages } from './assistant-turn.ts';

/** Breathing dot only before the assistant turn exists (no message-started yet). */
export function shouldShowTypingIndicator(
  status: AgentStatus,
  messages: FlueConversationMessage[],
): boolean {
  return isAgentBusy(status) && latestTurnAssistantMessages(messages).length === 0;
}
