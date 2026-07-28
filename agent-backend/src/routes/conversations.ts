import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { appConversations, db } from '../db/index.ts';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { canAccessAgent } from '../auth/permissions.ts';

const conversations = new Hono();

conversations.use('*', requireAuth);

conversations.get('/', async (c) => {
  const user = getUser(c);
  const agentName = c.req.query('agent');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);

  const conditions = [eq(appConversations.userId, user.id)];
  if (agentName) conditions.push(eq(appConversations.agentName, agentName));

  const rows = await db
    .select()
    .from(appConversations)
    .where(and(...conditions))
    .orderBy(desc(appConversations.updatedAt))
    .limit(limit);

  return c.json({ conversations: rows });
});

conversations.post('/', async (c) => {
  const user = getUser(c);
  const body = await c.req.json<{ agentName?: string; title?: string; id?: string }>();
  const agentName = body.agentName?.trim();
  if (!agentName) return c.json({ error: 'agentName is required' }, 400);
  if (!(await canAccessAgent(user, agentName))) return c.json({ error: 'Forbidden' }, 403);

  const id = body.id?.trim() || randomUUID();
  const title = body.title?.trim() || 'New conversation';

  const [row] = await db
    .insert(appConversations)
    .values({
      id,
      userId: user.id,
      agentName,
      title,
    })
    .returning();

  return c.json({ conversation: row }, 201);
});

conversations.patch('/:id', async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ title?: string }>();
  const title = body.title?.trim();
  if (!title) return c.json({ error: 'title is required' }, 400);

  const [row] = await db
    .update(appConversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(appConversations.id, id), eq(appConversations.userId, user.id)))
    .returning();

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ conversation: row });
});

conversations.delete('/:id', async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');

  const [row] = await db
    .delete(appConversations)
    .where(and(eq(appConversations.id, id), eq(appConversations.userId, user.id)))
    .returning({ id: appConversations.id });

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default conversations;
