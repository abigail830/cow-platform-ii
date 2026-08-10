import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FlueConversationMessage } from '@flue/react';
import {
  applyAbortedTurnSnapshots,
  finalizeMessagesForAbortFreeze,
  snapshotAbortedAssistantTurn,
} from './abort-freeze.ts';

function assistantMessage(
  id: string,
  submissionId: string,
  parts: FlueConversationMessage['parts'],
): FlueConversationMessage {
  return {
    id,
    role: 'assistant',
    submissionId,
    metadata: { timestamp: '2026-01-01T00:00:00.000Z' },
    parts,
  };
}

test('finalizeMessagesForAbortFreeze stops streaming affordances', () => {
  const messages = finalizeMessagesForAbortFreeze([
    assistantMessage('a1', 's1', [
      { type: 'reasoning', text: 'thinking', state: 'streaming' },
      { type: 'text', text: 'hello', state: 'streaming' },
      {
        type: 'dynamic-tool',
        toolName: 'read_skill_resource',
        toolCallId: 't1',
        state: 'input-available',
        input: { path: 'SKILL.md' },
      },
    ]),
  ]);

  assert.deepEqual(messages[0].parts, [
    { type: 'reasoning', text: 'thinking', state: 'done' },
    { type: 'text', text: 'hello', state: 'done' },
    {
      type: 'dynamic-tool',
      toolName: 'read_skill_resource',
      toolCallId: 't1',
      state: 'output-error',
      input: { path: 'SKILL.md' },
      errorText: 'Stopped',
    },
  ]);
});

test('applyAbortedTurnSnapshots keeps aborted turns frozen', () => {
  const frozen = snapshotAbortedAssistantTurn(
    [
      assistantMessage('a1', 's1', [{ type: 'text', text: 'partial', state: 'done' }]),
      assistantMessage('a2', 's1', [{ type: 'reasoning', text: 'more', state: 'streaming' }]),
    ],
    's1',
  );

  const live: FlueConversationMessage[] = [
    assistantMessage('a1', 's1', [{ type: 'text', text: 'partial', state: 'done' }]),
    assistantMessage('a2', 's1', [
      { type: 'reasoning', text: 'more reasoning', state: 'streaming' },
      { type: 'text', text: 'even more', state: 'streaming' },
    ]),
    assistantMessage('a3', 's2', [{ type: 'text', text: 'next turn', state: 'streaming' }]),
  ];

  const display = applyAbortedTurnSnapshots(live, new Map([['s1', frozen]]));
  assert.deepEqual(display, [
    ...frozen,
    assistantMessage('a3', 's2', [{ type: 'text', text: 'next turn', state: 'streaming' }]),
  ]);
});
