import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { appUsers, db } from '../../infrastructure/db/index.ts';
import { getUser, requireAuth, signToken } from '../../auth/jwt.ts';
import { loadUserAccessProfile } from '../../auth/rbac.ts';
import {
  authUserSchema,
  errorResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  meResponseSchema,
} from '../openapi/schemas/auth.ts';

const auth = new Hono();

async function buildAuthUser(user: typeof appUsers.$inferSelect) {
  const access = await loadUserAccessProfile(user.id);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as 'user' | 'operator' | 'admin',
    roles: access.roleKeys,
    permissions: access.permissions,
  };
}

auth.post(
  '/login',
  describeRoute({
    tags: ['Auth'],
    summary: 'Login with email and password',
    responses: {
      200: {
        description: 'JWT and user profile',
        content: { 'application/json': { schema: resolver(loginResponseSchema) } },
      },
      400: {
        description: 'Missing credentials',
        content: { 'application/json': { schema: resolver(errorResponseSchema) } },
      },
      401: {
        description: 'Invalid credentials',
        content: { 'application/json': { schema: resolver(errorResponseSchema) } },
      },
    },
  }),
  validator('json', loginBodySchema),
  async (c) => {
    const body = c.req.valid('json');
    const email = body.email.trim().toLowerCase();

    const rows = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const payload = await buildAuthUser(user);

    return c.json({
      token: signToken({
        id: payload.id,
        email: payload.email,
        displayName: payload.displayName,
        role: payload.role,
      }),
      user: payload,
    });
  },
);

auth.get(
  '/me',
  describeRoute({
    tags: ['Auth'],
    summary: 'Current session user',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Authenticated user',
        content: { 'application/json': { schema: resolver(meResponseSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(errorResponseSchema) } },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const jwtUser = getUser(c);
    const rows = await db.select().from(appUsers).where(eq(appUsers.id, jwtUser.id)).limit(1);
    const user = rows[0];
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ user: await buildAuthUser(user) });
  },
);

export default auth;
