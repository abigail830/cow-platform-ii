import type { Context, Next } from 'hono';
import type { AccessLevel } from '../infrastructure/db/index.ts';
import { getUser } from './jwt.ts';
import {
  getOrCreateRequestCache,
  loadUserAccessProfileCached,
} from './resource-access-request-cache.ts';
import { hasPermissionKey, hasResourcePermission, userHasPermission, userHasResourcePermission } from './rbac.ts';
import type { UserAccessProfile } from './rbac.ts';

export function requireResourcePermission(
  category: string,
  resource: string,
  required: AccessLevel = 'read',
) {
  return async (c: Context, next: Next) => {
    const user = getUser(c);
    const cache = getOrCreateRequestCache(c);
    let profile = c.get('userAccess');
    if (!profile) {
      profile = await loadUserAccessProfileCached(user.id, cache);
      c.set('userAccess', profile);
    }
    const allowed = await userHasResourcePermission(user.id, category, resource, required, {
      profile,
      cache,
      jwtRole: user.role,
    });
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);
    await next();
  };
}

/** Shorthand: `admin:models` + `read` checks `admin:models:read` or `admin:models:write`. */
export function requirePermission(permissionKey: string, required: AccessLevel = 'read') {
  return async (c: Context, next: Next) => {
    const user = getUser(c);
    const cache = getOrCreateRequestCache(c);
    let profile = c.get('userAccess');
    if (!profile) {
      profile = await loadUserAccessProfileCached(user.id, cache);
      c.set('userAccess', profile);
    }
    const allowed = await userHasPermission(user.id, permissionKey, required, {
      profile,
      cache,
      jwtRole: user.role,
    });
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);
    await next();
  };
}

/** Attach RBAC profile to context for handlers that need fine-grained checks. */
export async function attachUserAccess(c: Context, next: Next) {
  const user = getUser(c);
  const cache = getOrCreateRequestCache(c);
  const access = c.get('userAccess') ?? (await loadUserAccessProfileCached(user.id, cache));
  c.set('userAccess', access);
  await next();
}

declare module 'hono' {
  interface ContextVariableMap {
    userAccess: UserAccessProfile;
  }
}
