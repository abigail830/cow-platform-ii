import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FlueConversationMessage } from '@flue/react';
import { isLatestAssistantTurn } from './assistant-turn.ts';

function user(id: string, submissionId: string, text: string): FlueConversationMessage {
  return {
    id,
    role: 'user',
    submissionId,
    parts: [{ type: 'text', text, state: 'done' }],
  };
}

function assistant(
  id: string,
  submissionId: string,
  text: string,
  state: 'streaming' | 'done' = 'done',
): FlueConversationMessage {
  return {
    id,
    role: 'assistant',
    submissionId,
    parts: [{ type: 'text', text, state }],
  };
}

test('isLatestAssistantTurn matches the current submission turn only', () => {
  const previousTurn = [assistant('a1', 's1', 'older answer')];
  const all = [
    user('u1', 's1', 'first question'),
    ...previousTurn,
    user('u2', 's2', 'second question'),
    assistant('a2', 's2', 'new answer', 'streaming'),
  ];

  assert.equal(isLatestAssistantTurn(previousTurn, all), false);
  assert.equal(isLatestAssistantTurn([assistant('a2', 's2', 'new answer', 'streaming')], all), true);
});

test('isLatestAssistantTurn is false while waiting for the first assistant message', () => {
  const all = [user('u1', 's1', 'hello'), assistant('a1', 's0', 'previous answer')];
  assert.equal(isLatestAssistantTurn([assistant('a1', 's0', 'previous answer')], all), false);
});
