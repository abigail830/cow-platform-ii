import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { appUsers, db } from '../db/index.ts';
import { getUser, requireAuth, signToken } from '../auth/jwt.ts';

const auth = new Hono();

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

  const payload = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as 'user' | 'operator' | 'admin',
  };

  return c.json({
    token: signToken(payload),
    user: payload,
  });
});

auth.get('/me', requireAuth, (c) => {
  const user = getUser(c);
  return c.json({ user });
});

export default auth;
