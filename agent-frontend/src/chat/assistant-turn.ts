import type { AgentStatus, FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { isAgentBusy } from './agentStatus.ts';

export function latestTurnAssistantMessages(messages: FlueConversationMessage[]): FlueConversationMessage[] {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex === -1) return [];
  return messages.slice(lastUserIndex + 1).filter((message) => message.role === 'assistant');
}

export function latestTurnAssistantParts(messages: FlueConversationMessage[]): FlueConversationPart[] {
  return latestTurnAssistantMessages(messages).flatMap((message) => message.parts);
}

export function isAwaitingAssistantResponse(status: AgentStatus, messages: FlueConversationMessage[]): boolean {
  if (!isAgentBusy(status)) return false;
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  return last?.role === 'user';
}

export function inProgressStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'submitted':
      return 'Starting…';
    case 'streaming':
      return 'Working…';
    default:
      return 'Working…';
  }
}
