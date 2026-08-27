import { Hono } from 'hono';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { listAccessibleKnowledgeBaseIds } from '../auth/resource-access.ts';
import { knowledgeBaseAccessMiddleware } from '../auth/require-resource-access.ts';
import { routeParam } from '../http/route-param.ts';
import {
  handleGetResourceAccess,
  handlePutResourceAccess,
  handleTransferResourceOwner,
} from './resource-access-handlers.ts';
import { spawnKbImportWorker } from '../services/kb/kb-import-runner.ts';
import {
  batchDraftKbFaqs,
  batchPublishKbFaqs,
  createKbFaq,
  deleteKbFaqs,
  deleteKbFaq,
  getKbFaqById,
  listKbFaqs,
  polishKbFaqAnswer,
  startKbFaqExtractJob,
  startKbFaqIndexJob,
  updateKbFaq,
} from '../services/kb/kb-faqs.ts';
import {
  deleteKbChunksForDocument,
  listIndexedDocuments,
  listKbChunksForDocument,
} from '../services/kb/kb-chunks.ts';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKbItem,
  deleteKbItems,
  getKbImportJobPublic,
  getActiveKbImportJobForKnowledgeBase,
  getKbImportJobById,
  getKbItemById,
  getKnowledgeBaseById,
  getKnowledgeBasePublicById,
  listImportSources,
  listKbItems,
  listKnowledgeBases,
  startKbPageIndexImport,
  startKbRagIndexImport,
  toKbImportJobPublic,
  updateKnowledgeBase,
  type KnowledgeBaseType,
} from '../services/kb/knowledge-bases.ts';

const knowledgeBases = new Hono();

knowledgeBases.use('*', requireAuth);
knowledgeBases.use('/:id', knowledgeBaseAccessMiddleware());
knowledgeBases.use('/:id/*', knowledgeBaseAccessMiddleware());

knowledgeBases.get(
  '/rag-processing-options',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const { listRagPipelineOptions } = await import('../shared/kb/rag-pipeline-binding.ts');
    const options = await listRagPipelineOptions();
    return c.json(options);
  },
);

knowledgeBases.get(
  '/faq-processing-options',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const { listFaqPipelineOptions } = await import('../shared/kb/faq-pipeline-binding.ts');
    const options = await listFaqPipelineOptions();
    return c.json(options);
  },
);

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
    const user = getUser(c);
    const visibleIds = await listAccessibleKnowledgeBaseIds(user.id);
    const items = await listKnowledgeBases(visibleIds);
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
    if (!body.type || (body.type !== 'page_index' && body.type !== 'rag' && body.type !== 'faq')) {
      return c.json({ error: 'type must be page_index, rag, or faq' }, 400);
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
  '/:id/access',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);
    return handleGetResourceAccess(c, 'knowledge_base', id);
  },
);

knowledgeBases.put(
  '/:id/access',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);
    return handlePutResourceAccess(c, 'knowledge_base', id);
  },
);

knowledgeBases.post(
  '/:id/access/transfer-owner',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);
    return handleTransferResourceOwner(c, 'knowledge_base', id);
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
      pipeline_id?: string | null;
      metadata_keys?: string[];
      faq_settings?: {
        auto_index_on_publish?: boolean;
        polish_agent_def_id?: string | null;
        extract_pipeline_id?: string | null;
      };
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
        pipeline_id: body.pipeline_id,
        metadata_keys: body.metadata_keys,
        faq_settings: body.faq_settings,
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

knowledgeBases.get(
  '/:id/documents/:documentId/chunks',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
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
      return c.json({ error: 'Only RAG knowledge bases have indexed chunks' }, 400);
    }

    const offset = Number(c.req.query('offset') ?? 0);
    const limit = Number(c.req.query('limit') ?? 100);

    try {
      const result = await listKbChunksForDocument(id, documentId, { offset, limit });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list document chunks';
      const status = message === 'Knowledge base not found' || message === 'Document not found' ? 404 : 400;
      return c.json({ error: message }, status);
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

      await spawnKbImportWorker(result.job.id);

      return c.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start import';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.get(
  '/:id/faqs',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    try {
      const result = await listKbFaqs(id, {
        offset: Number(c.req.query('offset') ?? 0),
        limit: Number(c.req.query('limit') ?? 25),
        publication_status: c.req.query('publication_status') as 'draft' | 'published' | undefined,
        index_status: c.req.query('index_status') as
          | 'pending'
          | 'indexing'
          | 'indexed'
          | 'failed'
          | undefined,
        q: c.req.query('q')?.trim(),
      });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list FAQs';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/faqs',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{ question?: string; answer?: string }>().catch(() => ({}));
    const user = getUser(c);

    try {
      const faq = await createKbFaq({
        knowledgeBaseId: id,
        question: body.question ?? '',
        answer: body.answer ?? '',
        createdBy: user?.id,
      });
      return c.json(faq, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create FAQ';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.get(
  '/:id/faqs/:faqId',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const faqId = routeParam(c, 'faqId');
    if (!id || !faqId) return c.json({ error: 'Knowledge base id and FAQ id are required' }, 400);

    const faq = await getKbFaqById(id, faqId);
    if (!faq) return c.json({ error: 'FAQ not found' }, 404);
    return c.json(faq);
  },
);

knowledgeBases.patch(
  '/:id/faqs/:faqId',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const faqId = routeParam(c, 'faqId');
    if (!id || !faqId) return c.json({ error: 'Knowledge base id and FAQ id are required' }, 400);

    const body = await c.req.json<{ question?: string; answer?: string }>().catch(() => ({}));

    try {
      const faq = await updateKbFaq(id, faqId, body);
      return c.json(faq);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update FAQ';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.delete(
  '/:id/faqs/:faqId',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    const faqId = routeParam(c, 'faqId');
    if (!id || !faqId) return c.json({ error: 'Knowledge base id and FAQ id are required' }, 400);

    try {
      await deleteKbFaq(id, faqId);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete FAQ';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/faqs/batch-delete',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{ faq_ids?: string[] }>().catch(() => ({}));
    const faqIds = body.faq_ids ?? [];
    if (!Array.isArray(faqIds) || faqIds.length === 0) {
      return c.json({ error: 'faq_ids is required' }, 400);
    }

    try {
      const deletedCount = await deleteKbFaqs(id, faqIds);
      return c.json({ ok: true, deleted_count: deletedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete FAQs';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/faqs/batch-publish',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{ faq_ids?: string[] }>().catch(() => ({}));
    const faqIds = body.faq_ids ?? [];
    if (!Array.isArray(faqIds) || faqIds.length === 0) {
      return c.json({ error: 'faq_ids is required' }, 400);
    }

    try {
      const result = await batchPublishKbFaqs(id, faqIds);
      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish FAQs';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/faqs/batch-draft',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{ faq_ids?: string[] }>().catch(() => ({}));
    const faqIds = body.faq_ids ?? [];
    if (!Array.isArray(faqIds) || faqIds.length === 0) {
      return c.json({ error: 'faq_ids is required' }, 400);
    }

    try {
      const result = await batchDraftKbFaqs(id, faqIds);
      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move FAQs to draft';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/faqs/polish',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{
      faq_id?: string;
      question?: string;
      answer?: string;
    }>().catch(() => ({}));

    try {
      const result = await polishKbFaqAnswer(id, body);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to polish answer';
      const status = message.includes('not found')
        ? 404
        : message.includes('Chat completion') ||
            message.includes('VLM') ||
            message.includes('unreachable') ||
            message.includes('abort')
          ? 502
          : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/extract',
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
      const job = await startKbFaqExtractJob({
        knowledgeBaseId: id,
        channelIds: body.channel_ids,
        documentIds: body.document_ids,
        createdBy: user?.id,
      });
      await spawnKbImportWorker(job.id);
      const fresh = await getKbImportJobById(job.id);
      return c.json(
        { job: toKbImportJobPublic(fresh ?? job), document_count: job.documentIds.length },
        202,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start extract';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.post(
  '/:id/index-faqs',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const body = await c.req.json<{ faq_ids?: string[] }>().catch(() => ({}));
    const faqIds = body.faq_ids ?? [];
    if (!Array.isArray(faqIds) || faqIds.length === 0) {
      return c.json({ error: 'faq_ids is required' }, 400);
    }

    const user = getUser(c);

    try {
      const job = await startKbFaqIndexJob({
        knowledgeBaseId: id,
        faqIds,
        createdBy: user?.id,
      });
      await spawnKbImportWorker(job.id);
      const fresh = await getKbImportJobById(job.id);
      return c.json({ job: toKbImportJobPublic(fresh ?? job), faq_count: job.faqIds.length }, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start FAQ index';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

knowledgeBases.get(
  '/:id/import-jobs/active',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Knowledge base id is required' }, 400);

    const jobKind = c.req.query('job_kind')?.trim() || undefined;
    const job = await getActiveKbImportJobForKnowledgeBase(
      id,
      jobKind as 'faq_extract' | 'faq_index' | 'page_index_import' | 'rag_index' | undefined,
    );
    return c.json({ job: job ? toKbImportJobPublic(job) : null });
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
