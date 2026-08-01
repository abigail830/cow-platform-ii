import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FlueConversationMessage } from '@flue/react';
import { isActiveStreaming, shouldShowThinkingIndicator } from './typing-indicator.ts';

function user(text: string): FlueConversationMessage {
  return {
    id: 'u1',
    role: 'user',
    submissionId: 's1',
    parts: [{ type: 'text', text, state: 'done' }],
  };
}

function assistantText(text: string, state: 'streaming' | 'done' = 'done'): FlueConversationMessage {
  return {
    id: 'a1',
    role: 'assistant',
    submissionId: 's1',
    parts: [{ type: 'text', text, state }],
  };
}

test('shouldShowThinkingIndicator before assistant output starts', () => {
  assert.equal(shouldShowThinkingIndicator('submitted', [user('hello')]), true);
});

test('shouldShowThinkingIndicator hides while text streams', () => {
  const messages = [user('hello'), assistantText('partial', 'streaming')];
  assert.equal(isActiveStreaming(messages), true);
  assert.equal(shouldShowThinkingIndicator('streaming', messages), false);
});

test('shouldShowThinkingIndicator shows during settlement gap after visible completion', () => {
  const messages = [user('hello'), assistantText('final answer', 'done')];
  assert.equal(isActiveStreaming(messages), false);
  assert.equal(shouldShowThinkingIndicator('streaming', messages), true);
});
