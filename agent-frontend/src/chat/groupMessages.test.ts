import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FlueConversationMessage } from '@flue/react';
import { groupConsecutiveMessages, isSubmissionStatusMessage, mergeAssistantParts } from './groupMessages.ts';

function userMessage(id: string, text: string, submissionId?: string): FlueConversationMessage {
  return {
    id,
    role: 'user',
    submissionId,
    parts: [{ type: 'text', text, state: 'done' }],
  };
}

function assistantMessage(id: string, text: string, submissionId?: string): FlueConversationMessage {
  return {
    id,
    role: 'assistant',
    submissionId,
    parts: [{ type: 'text', text, state: 'done' }],
  };
}

test('groupConsecutiveMessages preserves transcript order', () => {
  const messages = [
    userMessage('u1', 'first', 'sub-1'),
    assistantMessage('a1', 'reply one', 'sub-1'),
    userMessage('u2', 'second', 'sub-2'),
    assistantMessage('a2', 'reply two', 'sub-2'),
  ];

  const rows = groupConsecutiveMessages(messages);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].kind, 'user');
  assert.equal(rows[1].kind, 'assistant');
  assert.equal(rows[2].kind, 'user');
  assert.equal(rows[3].kind, 'assistant');
});

test('groupConsecutiveMessages merges consecutive assistant rows only', () => {
  const messages = [
    userMessage('u1', 'prompt'),
    assistantMessage('a1a', 'reasoning part'),
    assistantMessage('a1b', 'final part'),
    userMessage('u2', 'follow-up'),
    assistantMessage('a2', 'answer'),
  ];

  const rows = groupConsecutiveMessages(messages);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].kind, 'user');
  assert.equal(rows[1].kind, 'assistant');
  if (rows[1].kind === 'assistant') {
    assert.equal(rows[1].messages.length, 2);
    assert.deepEqual(rows[1].messages.map((message) => message.id), ['a1a', 'a1b']);
  }
  assert.equal(rows[2].kind, 'user');
  assert.equal(rows[3].kind, 'assistant');
});

test('groupConsecutiveMessages does not reorder when submissionIds differ', () => {
  const messages = [
    userMessage('u1', 'first', 'sub-1'),
    userMessage('u2', 'second', 'sub-2'),
    assistantMessage('a1', 'late reply', 'sub-1'),
  ];

  const rows = groupConsecutiveMessages(messages);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].kind, 'user');
  assert.equal(rows[1].kind, 'user');
  assert.equal(rows[2].kind, 'assistant');
});

test('isSubmissionStatusMessage detects Flue submission signals', () => {
  assert.equal(
    isSubmissionStatusMessage(userMessage('s1', 'Submission was aborted.')),
    true,
  );
  assert.equal(isSubmissionStatusMessage(userMessage('s2', '你好')), false);
});

test('mergeAssistantParts merges tool parts by toolCallId', () => {
  const messages: FlueConversationMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'bash',
          toolCallId: 'call-1',
          state: 'input-available',
          input: { command: 'ls' },
        },
      ],
    },
    {
      id: 'a2',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'bash',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { command: 'ls' },
          output: 'ok',
        },
      ],
    },
  ];

  const parts = mergeAssistantParts(messages);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, 'dynamic-tool');
  if (parts[0]?.type === 'dynamic-tool') {
    assert.equal(parts[0].state, 'output-available');
  }
});
