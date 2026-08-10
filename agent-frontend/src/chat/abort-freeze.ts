import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { assistantMessagesForSubmission } from './groupMessages.ts';

/** Stop streaming affordances on a snapshot taken when the user aborts. */
export function finalizePartForAbortFreeze(part: FlueConversationPart): FlueConversationPart {
  if (part.type === 'text' || part.type === 'reasoning') {
    if (part.state === 'streaming') return { ...part, state: 'done' };
    return part;
  }

  if (part.type === 'dynamic-tool' && part.state === 'input-available') {
    return { ...part, state: 'output-error', errorText: 'Stopped' };
  }

  return part;
}

export function finalizeMessagesForAbortFreeze(
  messages: FlueConversationMessage[],
): FlueConversationMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map(finalizePartForAbortFreeze),
  }));
}

export function snapshotAbortedAssistantTurn(
  messages: FlueConversationMessage[],
  submissionId: string | undefined,
): FlueConversationMessage[] {
  if (!submissionId) return [];
  return finalizeMessagesForAbortFreeze(
    assistantMessagesForSubmission(messages, submissionId),
  );
}

/**
 * Replace live assistant messages for aborted submissions with the frozen snapshot
 * so observe() updates after abort do not keep streaming into the UI.
 */
export function applyAbortedTurnSnapshots(
  messages: FlueConversationMessage[],
  abortedTurns: ReadonlyMap<string, FlueConversationMessage[]>,
): FlueConversationMessage[] {
  if (abortedTurns.size === 0) return messages;

  const abortedIds = new Set(abortedTurns.keys());
  const inserted = new Set<string>();
  const result: FlueConversationMessage[] = [];

  for (const message of messages) {
    const submissionId = message.submissionId;
    if (message.role === 'assistant' && submissionId && abortedIds.has(submissionId)) {
      if (!inserted.has(submissionId)) {
        result.push(...(abortedTurns.get(submissionId) ?? []));
        inserted.add(submissionId);
      }
      continue;
    }
    result.push(message);
  }

  return result;
}
