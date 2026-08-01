import type { AuthUser } from '../api/auth.ts';

export type AccessLevel = 'read' | 'write';

export type PermissionGrant = {
  key: string;
  label: string;
  category: string;
  accessLevel: AccessLevel;
  routePatterns: string[];
  apiPatterns: string[];
};

function permissionKeySet(user: AuthUser): Set<string> {
  const keys = new Set<string>();
  for (const grant of user.permissions ?? []) {
    keys.add(grant.key);
  }
  return keys;
}

function hasResourcePermission(
  keys: Set<string>,
  category: string,
  resource: string,
  required: AccessLevel,
): boolean {
  const flatKey = `${category}:${resource}`;
  if (keys.has(flatKey)) return true;

  const writeKey = `${category}:${resource}:write`;
  const readKey = `${category}:${resource}:read`;
  if (keys.has(writeKey)) return true;
  if (required === 'read' && keys.has(readKey)) return true;
  return false;
}

/**
 * Check permission by resource shorthand (`platform-basic:models`, `admin:users`) or full key.
 */
export function hasPermission(
  user: AuthUser | null | undefined,
  key: string,
  required: AccessLevel = 'read',
): boolean {
  if (!user) return false;
  const keys = permissionKeySet(user);

  if (keys.size === 0) {
    return (user.role === 'admin' || user.role === 'operator') && (user.permissions?.length ?? 0) === 0;
  }

  if (key.endsWith(':read') || key.endsWith(':write')) {
    if (required === 'read') {
      if (keys.has(key)) return true;
      if (key.endsWith(':read')) {
        return keys.has(key.replace(/:read$/, ':write'));
      }
    }
    return keys.has(key);
  }

  const parts = key.split(':');
  if (parts.length === 2) {
    if (keys.has(key)) return true;
    return hasResourcePermission(keys, parts[0]!, parts[1]!, required);
  }

  return keys.has(key);
}

/** Agent playground / session explorer — single grant per feature; legacy users keep playground. */
export function hasAgentFeaturePermission(
  user: AuthUser | null | undefined,
  resource: 'playground' | 'session-explorer',
): boolean {
  if (!user) return false;
  const keys = permissionKeySet(user);
  if (keys.has(`agent:${resource}`)) return true;
  if (keys.size === 0 && resource === 'playground') return true;
  return false;
}

export function canSeeAdminSection(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const keys = permissionKeySet(user);
  if (keys.size > 0) {
    return [...keys].some((key) => key.startsWith('admin:') && (key.endsWith(':read') || key.endsWith(':write')));
  }
  return user.role === 'admin' || user.role === 'operator';
}
