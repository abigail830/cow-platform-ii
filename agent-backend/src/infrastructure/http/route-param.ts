import type { Context } from 'hono';

/** Postgres uuid text form. Used to skip static collection segments that Hono `/:id` also matches. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Route param from Hono may be undefined; normalize to null for narrowing. */
export function routeParam(c: Context, name: string): string | null {
  const value = c.req.param(name);
  return value ? value : null;
}
