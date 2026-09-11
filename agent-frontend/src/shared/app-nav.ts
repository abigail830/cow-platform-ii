import type { AuthUser } from '../api/auth.ts';
import {
  ADMIN_PAGES,
  EVALUATION_PAGES,
  KNOWLEDGE_MANAGEMENT_PAGES,
  PLATFORM_BASIC_PAGES,
  type NavPage,
} from './admin-nav.ts';
import { hasPermission } from './permissions.ts';

export const HOME_PATH = '/';

export function isPlatformAdminUser(user: AuthUser): boolean {
  const roles = user.roles?.length ? user.roles : [user.role];
  if (roles.includes('admin')) return true;
  return user.role === 'admin' || user.role === 'operator';
}

export function canAccessAppPath(user: AuthUser, path: string): boolean {
  if (path === HOME_PATH) return true;
  if (path === '/settings/api-keys' || path.startsWith('/settings/')) return true;

  const pages: readonly NavPage[] = [
    ...KNOWLEDGE_MANAGEMENT_PAGES,
    ...EVALUATION_PAGES,
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
