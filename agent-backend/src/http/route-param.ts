import type { Context } from 'hono';

/** Route param from Hono may be undefined; normalize to null for narrowing. */
export function routeParam(c: Context, name: string): string | null {
  const value = c.req.param(name);
  return value ? value : null;
}
