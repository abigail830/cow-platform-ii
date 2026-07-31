import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { mergeToolPart } from './tool-payload.ts';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

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
  const merged: FlueConversationPart[] = [];
  const toolIndex = new Map<string, number>();

  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type !== 'dynamic-tool') {
      merged.push(part);
      continue;
    }
    const tool = part as DynamicToolPart;
    const existingIndex = toolIndex.get(tool.toolCallId);
    if (existingIndex === undefined) {
      toolIndex.set(tool.toolCallId, merged.length);
      merged.push(tool);
      continue;
    }
    merged[existingIndex] = mergeToolPart(merged[existingIndex] as DynamicToolPart, tool);
  }

  return merged;
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
      return part.text.length > 0 || part.state === 'streaming';
    case 'dynamic-tool':
      return true;
    case 'file':
      return true;
    default:
      // Show every streamed event (data-* and future part kinds) in a fold.
      return true;
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
