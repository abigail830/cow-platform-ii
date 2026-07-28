import type { AgentStatus, FlueConversationMessage } from '@flue/react';
import { isAgentBusy } from './agentStatus.ts';

function latestTurnAssistantParts(messages: FlueConversationMessage[]) {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex === -1) return [];

  const parts: FlueConversationMessage['parts'] = [];
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role === 'assistant') parts.push(...message.parts);
  }
  return parts;
}

export function latestTurnHasAssistantText(messages: FlueConversationMessage[]): boolean {
  return latestTurnAssistantParts(messages).some(
    (part) => part.type === 'text' && part.text.length > 0,
  );
}

export function latestTurnHasVisibleAssistantOutput(messages: FlueConversationMessage[]): boolean {
  return latestTurnAssistantParts(messages).some((part) => {
    if (part.type === 'text' || part.type === 'reasoning') return part.text.length > 0;
    if (part.type === 'dynamic-tool') return true;
    return false;
  });
}

export function shouldShowTypingIndicator(
  status: AgentStatus,
  messages: FlueConversationMessage[],
): boolean {
  return isAgentBusy(status) && !latestTurnHasVisibleAssistantOutput(messages);
}
