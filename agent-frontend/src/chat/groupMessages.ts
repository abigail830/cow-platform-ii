import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { mergeToolPart } from './tool-payload.ts';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

export type ChatRow =
  | { kind: 'user'; message: FlueConversationMessage }
  | { kind: 'assistant'; messages: FlueConversationMessage[] };

/**
 * Preserve Flue's transcript order and only merge consecutive assistant rows
 * into one visual bubble. Do not reorder by submissionId.
 */
export function groupConsecutiveMessages(messages: FlueConversationMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      rows.push({ kind: 'user', message });
      continue;
    }

    if (message.role === 'assistant') {
      const last = rows.at(-1);
      if (last?.kind === 'assistant') {
        last.messages.push(message);
      } else {
        rows.push({ kind: 'assistant', messages: [message] });
      }
    }
  }

  return rows;
}

export function lastUserMessage(
  messages: FlueConversationMessage[],
): FlueConversationMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message;
  }
  return undefined;
}

export function assistantMessagesForSubmission(
  messages: FlueConversationMessage[],
  submissionId: string | undefined,
): FlueConversationMessage[] {
  if (!submissionId) return [];
  return messages.filter(
    (message) => message.role === 'assistant' && message.submissionId === submissionId,
  );
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

/** Flue projects submission signals (abort/interrupt) as user-role text messages. */
export function isSubmissionStatusMessage(message: FlueConversationMessage): boolean {
  if (message.role !== 'user') return false;
  const text = userMessageText(message).trim();
  return text.startsWith('Submission was ');
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
