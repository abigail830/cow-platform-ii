import { Hono } from 'hono';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { routeParam } from '../http/route-param.ts';
import { spawnKbPageIndexImportWorker } from '../services/kb-pageindex-import-runner.ts';
import { deleteKbChunksForDocument, listIndexedDocuments } from '../services/kb-chunks.ts';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKbItem,
  deleteKbItems,
  getKbImportJobPublic,
  getKbItemById,
  getKnowledgeBaseById,
  getKnowledgeBasePublicById,
  listImportSources,
  listKbItems,
  listKnowledgeBases,
  startKbPageIndexImport,
  startKbRagIndexImport,
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
      embedding_model_config_id?: string | null;
      embedding_dimensions?: number;
      chunk_config?: { strategy?: string; chunk_size?: number; chunk_overlap?: number };
      metadata_keys?: string[];
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
        embedding_model_config_id: body.embedding_model_config_id,
        embedding_dimensions: body.embedding_dimensions,
        chunk_config: body.chunk_config,
        metadata_keys: body.metadata_keys,
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
  '/:id/indexed-documents',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const kb = await getKnowledgeBaseById(id);
    if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
    if (kb.type !== 'rag') {
      return c.json({ error: 'indexed-documents is only for RAG knowledge bases' }, 400);
    }

    const offset = Number(c.req.query('offset') ?? 0);
    const limit = Number(c.req.query('limit') ?? 25);

    try {
      const result = await listIndexedDocuments(id, { offset, limit });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list indexed documents';
      return c.json({ error: message }, 400);
    }
  },
);

knowledgeBases.delete(
  '/:id/documents/:documentId/chunks',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const documentId = routeParam(c, 'documentId');
    if (!id || !documentId) {
      return c.json({ error: 'Knowledge base id and document id are required' }, 400);
    }

    const kb = await getKnowledgeBaseById(id);
    if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
    if (kb.type !== 'rag') {
      return c.json({ error: 'Only RAG knowledge bases support chunk removal' }, 400);
    }

    const deleted = await deleteKbChunksForDocument(id, documentId);
    return c.json({ ok: true, deleted });
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
      const kb = await getKnowledgeBaseById(id);
      if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);

      const result =
        kb.type === 'rag'
          ? await startKbRagIndexImport({
              knowledgeBaseId: id,
              channelIds: body.channel_ids,
              documentIds: body.document_ids,
              createdBy: user?.id,
            })
          : await startKbPageIndexImport({
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
