import type { AuthUser } from './jwt.ts';
import { getUserRoleKeys } from './permissions.ts';
import { loadUserAccessProfile, userHasResourcePermission } from './rbac.ts';
import { AGENT_CATEGORY, AGENT_RESOURCES } from './rbac-catalog.ts';

export const AGENT_PLAYER_ROLE = 'agent-player';

export async function canUseAgentPlayground(user: AuthUser): Promise<boolean> {
  if (await userHasResourcePermission(user.id, AGENT_CATEGORY, AGENT_RESOURCES.PLAYGROUND, 'read')) {
    return true;
  }
  const profile = await loadUserAccessProfile(user.id);
  return profile.permissionKeys.size === 0;
}

export async function canUseSessionExplorer(user: AuthUser): Promise<boolean> {
  return userHasResourcePermission(user.id, AGENT_CATEGORY, AGENT_RESOURCES.SESSION_EXPLORER, 'read');
}

export async function isPlatformAdmin(user: AuthUser): Promise<boolean> {
  const roleKeys = await getUserRoleKeys(user);
  if (roleKeys.includes('admin')) return true;
  return user.role === 'admin' || user.role === 'operator';
}

/** Agent-player without admin — sidenav and routes are limited to agent pages only. */
export async function isRestrictedAgentPlayer(user: AuthUser): Promise<boolean> {
  if (await isPlatformAdmin(user)) return false;
  const roleKeys = await getUserRoleKeys(user);
  return roleKeys.includes(AGENT_PLAYER_ROLE);
}
