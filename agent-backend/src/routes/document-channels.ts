import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import {
  createChannel,
  deleteChannel,
  getChannelById,
  listChannelTree,
  updateChannel,
} from '../services/documents.ts';

const channels = new Hono();

channels.use('*', requireAuth);

channels.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const tree = await listChannelTree();
    return c.json({ channels: tree });
  },
);

channels.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const row = await getChannelById(c.req.param('id'));
    if (!row) return c.json({ error: 'Channel not found' }, 404);
    return c.json({
      id: row.id,
      name: row.name,
      description: row.description,
      parent_id: row.parentId,
      sort_order: row.sortOrder,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  },
);

channels.post(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{ name?: string; description?: string; parent_id?: string | null }>();
    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

    try {
      const channel = await createChannel({
        name: body.name,
        description: body.description,
        parentId: body.parent_id ?? null,
        createdBy: user.id,
      });
      return c.json(channel, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create channel' }, 400);
    }
  },
);

channels.put(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      parent_id?: string | null;
    }>();

    try {
      const channel = await updateChannel(c.req.param('id'), {
        name: body.name,
        description: body.description,
        parentId: body.parent_id,
      });
      return c.json(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update channel';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

channels.delete(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    try {
      await deleteChannel(c.req.param('id'));
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete channel';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default channels;
