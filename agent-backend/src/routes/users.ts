import { Hono } from 'hono';
import { requireAuth } from '../auth/jwt.ts';
import { lookupUsersForSharing } from '../auth/resource-access.ts';

const users = new Hono();

users.use('*', requireAuth);

users.get('/lookup', async (c) => {
  const q = c.req.query('q') ?? undefined;
  const items = await lookupUsersForSharing(q);
  return c.json({ users: items });
});

export default users;
