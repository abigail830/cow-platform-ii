import type { Context, Next } from 'hono';
import jwt, { type SignOptions } from 'jsonwebtoken';

export type UserRole = 'user' | 'operator' | 'admin';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
};

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
  try {
    const user = verifyToken(token);
    c.set('user', user);
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
  }
}
