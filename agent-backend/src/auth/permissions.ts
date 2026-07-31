import type { AuthUser } from './jwt.ts';
import { appAgentPermissions, appConversations, db } from '../db/index.ts';
import { getAgentRegistry } from '../agent-catalog/registry.ts';
import { bootAgentCatalog } from '../agent-catalog/boot.ts';
import { and, eq } from 'drizzle-orm';

export async function canAccessAgent(user: AuthUser, agentName: string): Promise<boolean> {
  bootAgentCatalog();
  if (!getAgentRegistry().has(agentName)) return false;
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
  bootAgentCatalog();
  const catalogIds = getAgentRegistry().listIds();
  if (user.role === 'admin' || user.role === 'operator') {
    return catalogIds;
  }
  const rows = await db
    .select({ agentName: appAgentPermissions.agentName })
    .from(appAgentPermissions)
    .where(eq(appAgentPermissions.userId, user.id));
  const allowed = new Set(rows.map((r) => r.agentName));
  return catalogIds.filter((id) => allowed.has(id));
}
