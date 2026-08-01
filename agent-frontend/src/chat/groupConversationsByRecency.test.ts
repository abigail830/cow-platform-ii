import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Conversation } from '../api/conversations.ts';
import { groupConversationsByRecency } from './groupConversationsByRecency.ts';

function conversation(id: string, updatedAt: string): Conversation {
  return {
    id,
    userId: 'u1',
    agentName: 'content-studio',
    title: id,
    createdAt: updatedAt,
    updatedAt,
  };
}

test('groupConversationsByRecency buckets by today, last 7 days, and older', () => {
  const now = new Date('2026-08-01T15:00:00.000Z');
  const groups = groupConversationsByRecency(
    [
      conversation('today', '2026-08-01T10:00:00.000Z'),
      conversation('last-week', '2026-07-28T10:00:00.000Z'),
      conversation('older', '2026-07-01T10:00:00.000Z'),
    ],
    now,
  );

  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      ids: group.conversations.map((item) => item.id),
    })),
    [
      { label: 'Today', ids: ['today'] },
      { label: 'Last 7 days', ids: ['last-week'] },
      { label: 'Older', ids: ['older'] },
    ],
  );
});

test('groupConversationsByRecency omits empty sections', () => {
  const groups = groupConversationsByRecency(
    [conversation('today', '2026-08-01T10:00:00.000Z')],
    new Date('2026-08-01T15:00:00.000Z'),
  );

  assert.deepEqual(groups.map((group) => group.label), ['Today']);
});
