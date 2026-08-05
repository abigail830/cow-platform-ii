import type { AuthUser } from './jwt.ts';
import { appConversations, appStudioAgents, db } from '../db/index.ts';
import { isAgentVisibleToRoles } from '../agent-catalog/agent-access.ts';
import { getAgentRegistry } from '../agent-catalog/registry.ts';
import { bootAgentCatalog } from '../agent-catalog/boot.ts';
import { userHasStudioAgentAccess } from './resource-access.ts';
import { loadUserAccessProfile } from './rbac.ts';
import { and, eq } from 'drizzle-orm';

/** RBAC role keys for catalog agent menu visibility; falls back to legacy `app_users.role`. */
export async function getUserRoleKeys(user: AuthUser): Promise<string[]> {
  const profile = await loadUserAccessProfile(user.id);
  if (profile.roleKeys.length > 0) return profile.roleKeys;
  return [user.role];
}

/**
 * Agents visible in Playground for this user: FS (role) ∪ studio (ACL read).
 */
export async function listAllowedAgents(user: AuthUser): Promise<string[]> {
  bootAgentCatalog();
  const roleKeys = await getUserRoleKeys(user);
  const registry = getAgentRegistry();
  const allowed: string[] = [];

  for (const id of registry.listIds()) {
    const entry = registry.get(id);
    if (!entry) continue;
    if (entry.spec.source === 'studio') {
      const studioId = entry.spec.studioMeta?.id;
      if (!studioId) continue;
      if (await userHasStudioAgentAccess(user.id, studioId, 'read')) {
        allowed.push(id);
      }
      continue;
    }
    if (isAgentVisibleToRoles(entry.spec, roleKeys)) {
      allowed.push(id);
    }
  }
  return allowed;
}

/** Gate creating a new conversation for an agent (same rule as menu visibility). */
export async function canAccessAgent(user: AuthUser, agentName: string): Promise<boolean> {
  bootAgentCatalog();
  const entry = getAgentRegistry().get(agentName);
  if (!entry) return false;
  if (entry.spec.source === 'studio') {
    const studioId = entry.spec.studioMeta?.id;
    if (!studioId) {
      const [row] = await db
        .select({ id: appStudioAgents.id })
        .from(appStudioAgents)
        .where(eq(appStudioAgents.slug, agentName))
        .limit(1);
      if (!row) return false;
      return userHasStudioAgentAccess(user.id, row.id, 'read');
    }
    return userHasStudioAgentAccess(user.id, studioId, 'read');
  }
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
