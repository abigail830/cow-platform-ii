import type { AuthUser } from './jwt.ts';
import { getUserRoleKeys } from './permissions.ts';

export const AGENT_PLAYER_ROLE = 'agent-player';

export async function getRoleKeysForUser(user: AuthUser): Promise<string[]> {
  return getUserRoleKeys(user);
}

export async function isPlatformAdmin(user: AuthUser): Promise<boolean> {
  const roleKeys = await getRoleKeysForUser(user);
  if (roleKeys.includes('admin')) return true;
  return user.role === 'admin' || user.role === 'operator';
}

export async function canUseSessionExplorer(user: AuthUser): Promise<boolean> {
  const roleKeys = await getRoleKeysForUser(user);
  if (roleKeys.includes('admin') || roleKeys.includes(AGENT_PLAYER_ROLE)) return true;
  return user.role === 'admin' || user.role === 'operator';
}

/** Agent-player without admin — sidenav and routes are limited to agent pages only. */
export async function isRestrictedAgentPlayer(user: AuthUser): Promise<boolean> {
  const roleKeys = await getRoleKeysForUser(user);
  if (roleKeys.includes('admin')) return false;
  if (user.role === 'admin' || user.role === 'operator') return false;
  return roleKeys.includes(AGENT_PLAYER_ROLE);
}
