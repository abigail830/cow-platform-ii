import { and, eq } from 'drizzle-orm';
import type { AuthUser } from './jwt.ts';
import { appAgentPermissions, appConversations, db } from '../db/index.ts';

export async function canAccessAgent(user: AuthUser, agentName: string): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'operator') return true;
  const rows = await db
    .select()
    .from(appAgentPermissions)
    .where(and(eq(appAgentPermissions.userId, user.id), eq(appAgentPermissions.agentName, agentName)))
    .limit(1);
  return rows.length > 0;
}

export async function ownsConversation(userId: string, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: appConversations.id })
    .from(appConversations)
    .where(and(eq(appConversations.id, conversationId), eq(appConversations.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function listAllowedAgents(user: AuthUser): Promise<string[]> {
  if (user.role === 'admin' || user.role === 'operator') {
    return ['smart-proposal', 'generic-okf'];
  }
  const rows = await db
    .select({ agentName: appAgentPermissions.agentName })
    .from(appAgentPermissions)
    .where(eq(appAgentPermissions.userId, user.id));
  return rows.map((r) => r.agentName);
}
