import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { appUsers, db } from '../db/index.ts';
import { getUser, requireAuth, signToken } from '../auth/jwt.ts';
import { loadUserAccessProfile } from '../auth/rbac.ts';

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

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

  const rows = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
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
});

auth.get('/me', requireAuth, async (c) => {
  const jwtUser = getUser(c);
  const rows = await db.select().from(appUsers).where(eq(appUsers.id, jwtUser.id)).limit(1);
  const user = rows[0];
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user: await buildAuthUser(user) });
});

export default auth;
