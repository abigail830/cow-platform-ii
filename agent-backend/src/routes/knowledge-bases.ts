import { Hono } from 'hono';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { routeParam } from '../http/route-param.ts';
import { spawnKbPageIndexImportWorker } from '../services/kb-pageindex-import-runner.ts';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKbItem,
  deleteKbItems,
  getKbImportJobPublic,
  getKbItemById,
  getKnowledgeBasePublicById,
  listImportSources,
  listKbItems,
  listKnowledgeBases,
  startKbPageIndexImport,
  updateKnowledgeBase,
  type KnowledgeBaseType,
} from '../services/knowledge-bases.ts';

const knowledgeBases = new Hono();

knowledgeBases.use('*', requireAuth);

knowledgeBases.get(
  '/import-sources',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const sources = await listImportSources();
    return c.json(sources);
  },
);

knowledgeBases.get(
  '/',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const items = await listKnowledgeBases();
    return c.json({ items });
  },
);

knowledgeBases.post(
  '/',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      type?: KnowledgeBaseType;
    }>().catch(() => ({}));

    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
    if (!body.type || (body.type !== 'page_index' && body.type !== 'rag')) {
      return c.json({ error: 'type must be page_index or rag' }, 400);
    }

    const user = getUser(c);
    try {
      const kb = await createKnowledgeBase({
        name: body.name,
        description: body.description,
        type: body.type,
        createdBy: user?.id,
      });
      return c.json(kb, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create knowledge base';
      return c.json({ error: message }, 400);
    }
  },
);

knowledgeBases.get(
  '/:id',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const kb = await getKnowledgeBasePublicById(id);
    if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
    return c.json(kb);
  },
);

knowledgeBases.patch(
  '/:id',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      type?: string;
    }>().catch(() => ({}));

    if (body.type !== undefined) {
      return c.json({ error: 'Knowledge base type cannot be changed' }, 400);
    }
    if (body.name !== undefined && !body.name.trim()) {
      return c.json({ error: 'name cannot be empty' }, 400);
    }

    try {
      const kb = await updateKnowledgeBase(id, {
        name: body.name,
        description: body.description,
      });
      return c.json(kb);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update knowledge base';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.delete(
  '/:id',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    try {
      await deleteKnowledgeBase(id);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete knowledge base';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.get(
  '/:id/items',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const offset = Number(c.req.query('offset') ?? 0);
    const limit = Number(c.req.query('limit') ?? 25);
    const includeContent = c.req.query('include_content') === 'true';

    try {
      const result = await listKbItems(id, { offset, limit, includeContent });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list items';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.get(
  '/:id/items/:itemId',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const itemId = routeParam(c, 'itemId');
    if (!id || !itemId) return c.json({ error: 'Knowledge base id and item id are required' }, 400);

    const item = await getKbItemById(id, itemId);
    if (!item) return c.json({ error: 'Item not found' }, 404);
    return c.json(item);
  },
);

knowledgeBases.delete(
  '/:id/items/:itemId',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const itemId = routeParam(c, 'itemId');
    if (!id || !itemId) return c.json({ error: 'Knowledge base id and item id are required' }, 400);

    try {
      await deleteKbItem(id, itemId);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete item';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/items/batch-delete',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{ item_ids?: string[] }>().catch(() => ({}));
    const itemIds = body.item_ids ?? [];
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return c.json({ error: 'item_ids is required' }, 400);
    }

    try {
      const deletedCount = await deleteKbItems(id, itemIds);
      return c.json({ ok: true, deleted_count: deletedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete items';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/import',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{
      channel_ids?: string[];
      document_ids?: string[];
    }>().catch(() => ({}));

    const user = getUser(c);

    try {
      const result = await startKbPageIndexImport({
        knowledgeBaseId: id,
        channelIds: body.channel_ids,
        documentIds: body.document_ids,
        createdBy: user?.id,
      });

      await spawnKbPageIndexImportWorker(result.job.id);

      return c.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start import';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.get(
  '/:id/import-jobs/:jobId',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const jobId = routeParam(c, 'jobId');
    if (!id || !jobId) return c.json({ error: 'Knowledge base id and job id are required' }, 400);

    const job = await getKbImportJobPublic(id, jobId);
    if (!job) return c.json({ error: 'Import job not found' }, 404);
    return c.json(job);
  },
);

export default knowledgeBases;
