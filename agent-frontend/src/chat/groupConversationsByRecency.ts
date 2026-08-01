import type { Conversation } from '../api/conversations.ts';

export type ConversationGroupLabel = 'Today' | 'Last 7 days' | 'Older';

export type ConversationGroup = {
  label: ConversationGroupLabel;
  conversations: Conversation[];
};

function startOfLocalDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function groupConversationsByRecency(
  conversations: Conversation[],
  now = new Date(),
): ConversationGroup[] {
  const startOfToday = startOfLocalDay(now);
  const startOfLast7 = new Date(startOfToday);
  startOfLast7.setDate(startOfLast7.getDate() - 7);

  const today: Conversation[] = [];
  const last7: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conversation of conversations) {
    const updated = new Date(conversation.updatedAt);
    if (updated >= startOfToday) {
      today.push(conversation);
    } else if (updated >= startOfLast7) {
      last7.push(conversation);
    } else {
      older.push(conversation);
    }
  }

  const groups: ConversationGroup[] = [];
  if (today.length > 0) groups.push({ label: 'Today', conversations: today });
  if (last7.length > 0) groups.push({ label: 'Last 7 days', conversations: last7 });
  if (older.length > 0) groups.push({ label: 'Older', conversations: older });
  return groups;
}
