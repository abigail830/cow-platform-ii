import type { Context, Next } from 'hono';
import type { AccessLevel } from '../db/index.ts';
import { getUser } from './jwt.ts';
import { loadUserAccessProfile, userHasPermission, userHasResourcePermission } from './rbac.ts';

export function requireResourcePermission(
  category: string,
  resource: string,
  required: AccessLevel = 'read',
) {
  return async (c: Context, next: Next) => {
    const user = getUser(c);
    const allowed = await userHasResourcePermission(user.id, category, resource, required);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);
    await next();
  };
}

/** Shorthand: `admin:models` + `read` checks `admin:models:read` or `admin:models:write`. */
export function requirePermission(permissionKey: string, required: AccessLevel = 'read') {
  return async (c: Context, next: Next) => {
    const user = getUser(c);
    const allowed = await userHasPermission(user.id, permissionKey, required);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);
    await next();
  };
}

/** Attach RBAC profile to context for handlers that need fine-grained checks. */
export async function attachUserAccess(c: Context, next: Next) {
  const user = getUser(c);
  const access = await loadUserAccessProfile(user.id);
  c.set('userAccess', access);
  await next();
}

declare module 'hono' {
  interface ContextVariableMap {
    userAccess: Awaited<ReturnType<typeof loadUserAccessProfile>>;
  }
}
