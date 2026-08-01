import type { AgentStatus, FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { isAgentBusy } from './agentStatus.ts';

function lastConversationPart(messages: FlueConversationMessage[]): FlueConversationPart | undefined {
  return messages.at(-1)?.parts.at(-1);
}

/** Matches Flue demo: a visible part is actively receiving content. */
export function isActiveStreaming(messages: FlueConversationMessage[]): boolean {
  const lastPart = lastConversationPart(messages);
  if (!lastPart) return false;

  if (lastPart.type === 'text') return lastPart.state === 'streaming';
  if (lastPart.type === 'reasoning') return lastPart.state === 'streaming';
  if (lastPart.type === 'dynamic-tool') return lastPart.state === 'input-available';
  return false;
}

/**
 * Flue demo shows a transient thinking indicator while status is busy but no
 * visible part is actively streaming — initial wait, hidden reasoning, tool gaps,
 * and the post-response settlement window before status returns to idle.
 */
export function shouldShowThinkingIndicator(
  status: AgentStatus,
  messages: FlueConversationMessage[],
): boolean {
  return isAgentBusy(status) && !isActiveStreaming(messages);
}
