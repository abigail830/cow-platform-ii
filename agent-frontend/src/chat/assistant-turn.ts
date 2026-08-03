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

export function isLatestAssistantTurn(
  turnMessages: FlueConversationMessage[],
  allMessages: FlueConversationMessage[],
): boolean {
  const lastUser = lastUserMessage(allMessages);
  if (!lastUser?.submissionId || turnMessages.length === 0) return false;

  const turnSubmissionId = turnMessages.find((message) => message.submissionId)?.submissionId;
  if (!turnSubmissionId || turnSubmissionId !== lastUser.submissionId) return false;

  const latest = latestTurnAssistantMessages(allMessages);
  if (latest.length === 0) return false;

  const latestIds = new Set(latest.map((message) => message.id));
  return turnMessages.some((message) => latestIds.has(message.id));
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
