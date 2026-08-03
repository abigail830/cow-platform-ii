import type { AuthUser } from '../api/auth.ts';
import {
  ADMIN_PAGES,
  AGENT_PAGES,
  AGENT_PLAYGROUND_PATH,
  KNOWLEDGE_MANAGEMENT_PAGES,
  PLATFORM_BASIC_PAGES,
  SESSION_EXPLORER_PATH,
  type NavPage,
} from './admin-nav.ts';
import { hasAgentFeaturePermission, hasPermission } from './permissions.ts';

export const AGENT_PLAYER_ROLE = 'agent-player';

export const HOME_PATH = '/';

export const AGENT_PLAYER_ALLOWED_PATHS = [AGENT_PLAYGROUND_PATH, SESSION_EXPLORER_PATH] as const;

function roleKeys(user: AuthUser): string[] {
  if (user.roles?.length) return user.roles;
  return [user.role];
}

export function isPlatformAdminUser(user: AuthUser): boolean {
  const roles = roleKeys(user);
  if (roles.includes('admin')) return true;
  return user.role === 'admin' || user.role === 'operator';
}

export function canSeeSessionExplorer(user: AuthUser): boolean {
  return hasAgentFeaturePermission(user, 'session-explorer');
}

export function isRestrictedAgentPlayer(user: AuthUser): boolean {
  if (isPlatformAdminUser(user)) return false;
  return roleKeys(user).includes(AGENT_PLAYER_ROLE);
}

export function visibleAgentPages(user: AuthUser): NavPage[] {
  return AGENT_PAGES.filter((page) => {
    if (page.path === AGENT_PLAYGROUND_PATH) {
      return hasAgentFeaturePermission(user, 'playground');
    }
    if (page.path === SESSION_EXPLORER_PATH) {
      return hasAgentFeaturePermission(user, 'session-explorer');
    }
    return hasPermission(user, page.permissionKey, 'read');
  });
}

export function visibleNavPages(user: AuthUser): NavPage[] {
  return [
    ...visibleAgentPages(user),
    ...KNOWLEDGE_MANAGEMENT_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read')),
    ...PLATFORM_BASIC_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read')),
    ...ADMIN_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read')),
  ];
}

export function canAccessAppPath(user: AuthUser, path: string): boolean {
  if (path === HOME_PATH) return true;

  if (path === AGENT_PLAYGROUND_PATH || path.startsWith(`${AGENT_PLAYGROUND_PATH}/`)) {
    return hasAgentFeaturePermission(user, 'playground');
  }

  if (path === SESSION_EXPLORER_PATH || path.startsWith(`${SESSION_EXPLORER_PATH}/`)) {
    return hasAgentFeaturePermission(user, 'session-explorer');
  }

  if (path === '/chat' || path.startsWith('/chat/')) {
    return hasAgentFeaturePermission(user, 'playground');
  }

  const pages: readonly NavPage[] = [
    ...AGENT_PAGES,
    ...KNOWLEDGE_MANAGEMENT_PAGES,
    ...PLATFORM_BASIC_PAGES,
    ...ADMIN_PAGES,
  ];

  const page = pages.find((item) => path === item.path || path.startsWith(`${item.path}/`));
  if (!page) return true;
  if (!page.permissionKey) return true;
  return hasPermission(user, page.permissionKey, 'read');
}

/** First route the user may open after login or when denied the current path. */
export function resolveAppHomePath(_user: AuthUser): string {
  return HOME_PATH;
}
