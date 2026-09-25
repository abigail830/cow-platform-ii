import { Hono } from 'hono';
import { getUser, requireSessionAuth } from '../../auth/jwt.ts';
import { routeParam } from '../../infrastructure/http/route-param.ts';
import {
  dismissNotification,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../application/user-notifications.ts';

const notifications = new Hono();

notifications.use('*', requireSessionAuth);

notifications.get('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const unreadOnly = c.req.query('unread_only') === 'true';
  const limit = Number(c.req.query('limit') ?? '30');
  const result = await listUserNotifications({
    userId: user.id,
    unreadOnly,
    limit: Number.isFinite(limit) ? limit : 30,
  });
  return c.json(result);
});

notifications.patch('/:id/read', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Notification id is required' }, 400);

  const ok = await markNotificationRead(user.id, id);
  if (!ok) return c.json({ error: 'Notification not found' }, 404);
  return c.json({ ok: true });
});

notifications.post('/:id/dismiss', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Notification id is required' }, 400);

  const ok = await dismissNotification(user.id, id);
  if (!ok) return c.json({ error: 'Notification not found' }, 404);
  return c.json({ ok: true });
});

notifications.post('/mark-all-read', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const count = await markAllNotificationsRead(user.id);
  return c.json({ ok: true, marked_count: count });
});

export default notifications;
