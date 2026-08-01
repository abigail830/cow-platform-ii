import type { AgentStatus, FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { assistantMessagesForSubmission, lastUserMessage } from './groupMessages.ts';

export function latestTurnAssistantMessages(messages: FlueConversationMessage[]): FlueConversationMessage[] {
  const lastUser = lastUserMessage(messages);
  if (!lastUser) return [];

  const bySubmission = assistantMessagesForSubmission(messages, lastUser.submissionId);
  if (bySubmission.length > 0) return bySubmission;

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  return messages.slice(lastUserIndex + 1).filter((message) => message.role === 'assistant');
}

export function latestTurnAssistantParts(messages: FlueConversationMessage[]): FlueConversationPart[] {
  return latestTurnAssistantMessages(messages).flatMap((message) => message.parts);
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
