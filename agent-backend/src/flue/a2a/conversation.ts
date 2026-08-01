import { eq } from 'drizzle-orm';
import { appConversations, db } from '../../db/index.ts';

export async function ensureA2aConversation(input: {
  conversationId: string;
  userId: string;
  agentName: string;
  title?: string;
}): Promise<void> {
  const [existing] = await db
    .select({ id: appConversations.id })
    .from(appConversations)
    .where(eq(appConversations.id, input.conversationId))
    .limit(1);

  if (existing) return;

  await db.insert(appConversations).values({
    id: input.conversationId,
    userId: input.userId,
    agentName: input.agentName,
    title: input.title?.trim() || 'A2A session',
  });
}
