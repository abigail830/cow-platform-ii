import type { AuthUser } from './jwt.ts';
import { appConversations, db } from '../db/index.ts';
import { isAgentVisibleToRoles } from '../agent-catalog/agent-access.ts';
import { getAgentRegistry } from '../agent-catalog/registry.ts';
import { bootAgentCatalog } from '../agent-catalog/boot.ts';
import { loadUserAccessProfile } from './rbac.ts';
import { and, eq } from 'drizzle-orm';

/** RBAC role keys for catalog agent menu visibility; falls back to legacy `app_users.role`. */
export async function getUserRoleKeys(user: AuthUser): Promise<string[]> {
  const profile = await loadUserAccessProfile(user.id);
  if (profile.roleKeys.length > 0) return profile.roleKeys;
  return [user.role];
}

/**
 * Catalog agents visible in the side-nav menu for this user's roles.
 * This is the only agent-access gate for ongoing chat (Flue routes check conversation ownership only).
 */
export async function listAllowedAgents(user: AuthUser): Promise<string[]> {
  bootAgentCatalog();
  const roleKeys = await getUserRoleKeys(user);
  const registry = getAgentRegistry();
  return registry.listIds().filter((id) => {
    const entry = registry.get(id);
    if (!entry) return false;
    return isAgentVisibleToRoles(entry.spec, roleKeys);
  });
}

/** Gate creating a new conversation for an agent (same rule as menu visibility). */
export async function canAccessAgent(user: AuthUser, agentName: string): Promise<boolean> {
  bootAgentCatalog();
  const entry = getAgentRegistry().get(agentName);
  if (!entry) return false;
  const roleKeys = await getUserRoleKeys(user);
  return isAgentVisibleToRoles(entry.spec, roleKeys);
}

export async function ownsConversation(userId: string, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: appConversations.id })
    .from(appConversations)
    .where(and(eq(appConversations.id, conversationId), eq(appConversations.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
