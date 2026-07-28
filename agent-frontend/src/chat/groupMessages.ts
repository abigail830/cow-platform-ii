import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';

export type ChatTurn =
  | { kind: 'user'; message: FlueConversationMessage }
  | { kind: 'assistant'; messages: FlueConversationMessage[] };

export function groupMessages(messages: FlueConversationMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let pendingAssistant: FlueConversationMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      if (pendingAssistant.length > 0) {
        turns.push({ kind: 'assistant', messages: pendingAssistant });
        pendingAssistant = [];
      }
      turns.push({ kind: 'user', message });
      continue;
    }
    pendingAssistant.push(message);
  }

  if (pendingAssistant.length > 0) {
    turns.push({ kind: 'assistant', messages: pendingAssistant });
  }

  return turns;
}

export function mergeAssistantParts(messages: FlueConversationMessage[]): FlueConversationPart[] {
  return messages.flatMap((message) => message.parts);
}

export function userMessageText(message: FlueConversationMessage): string {
  return message.parts
    .filter((p): p is Extract<FlueConversationPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function shouldRenderPart(part: FlueConversationPart): boolean {
  switch (part.type) {
    case 'text':
      return part.text.length > 0 || part.state === 'streaming';
    case 'reasoning':
      return part.text.trim().length > 0;
    case 'dynamic-tool':
      return true;
    default:
      if (part.type.startsWith('data-')) {
        const payload = (part as { data?: unknown }).data;
        if (payload === undefined || payload === null) return false;
        if (typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0) {
          return false;
        }
        return true;
      }
      return false;
  }
}

export function filterRenderableParts(parts: FlueConversationPart[]): FlueConversationPart[] {
  return parts.filter(shouldRenderPart);
}

export function partRenderKey(part: FlueConversationPart, index: number): string {
  if (part.type === 'dynamic-tool') return `tool-${part.toolCallId}`;
  if (part.type.startsWith('data-')) {
    const dataPart = part as { type: string; id?: string };
    return `data-${dataPart.id ?? dataPart.type}-${index}`;
  }
  return `${part.type}-${index}`;
}
