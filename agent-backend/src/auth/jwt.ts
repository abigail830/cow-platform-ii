import type { Context, Next } from 'hono';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { isApiKeyToken } from './api-key.ts';

export type UserRole = 'user' | 'operator' | 'admin';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
};

export type AuthMethod = 'jwt' | 'api-key';

export type JwtPayload = AuthUser;

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

export function signToken(user: AuthUser): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'];
  return jwt.sign(user, jwtSecret(), { expiresIn });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, jwtSecret()) as AuthUser;
}

export function bearerToken(c: Context): string | undefined {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim();
}

export async function requireAuth(c: Context, next: Next) {
  const token = bearerToken(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  if (isApiKeyToken(token)) {
    const { resolveUserFromApiKey } = await import('./resolve-user-api-key.ts');
    const user = await resolveUserFromApiKey(token);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', user);
    c.set('authMethod', 'api-key');
    await next();
    return;
  }

  try {
    const user = verifyToken(token);
    c.set('user', user);
    c.set('authMethod', 'jwt');
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}

/** Session-only routes (API key management, etc.) — rejects Bearer okf_ keys. */
export async function requireSessionAuth(c: Context, next: Next) {
  const token = bearerToken(c);
  if (!token || isApiKeyToken(token)) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const user = verifyToken(token);
    c.set('user', user);
    c.set('authMethod', 'jwt');
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}

export function getUser(c: Context): AuthUser {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) throw new Error('Missing auth user in context');
  return user;
}

export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = getUser(c);
    if (!roles.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
    await next();
  };
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    authMethod?: AuthMethod;
  }
}
