import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  batchInsertKbChunks,
  deleteKbChunksForDocument,
  type KbChunkBatchItem,
} from '../../services/kb/kb-chunks.ts';
import {
  upsertKbChunkDocumentFromWorker,
  type KbChunkDocumentIndexStatus,
} from '../../services/kb/kb-chunk-documents.ts';
import {
  getKbWorkerConfig,
  getKnowledgeBaseById,
  upsertKbItemFromWorker,
  type KbItemImportStatus,
} from '../../services/kb/knowledge-bases.ts';
import {
  batchCreateKbFaqsFromWorker,
  getKbFaqsForWorker,
  refreshFaqDocMetadataForIndex,
  updateKbFaqFromWorker,
} from '../../services/kb/kb-faqs.ts';

const knowledgeBasesInternal = new Hono();

knowledgeBasesInternal.use('*', requireCliInternalAuth);

knowledgeBasesInternal.get('/:kbId', async (c) => {
  const kbId = routeParam(c, 'kbId');
  if (!kbId) return c.json({ error: 'Knowledge base id is required' }, 400);

  try {
    const config = await getKbWorkerConfig(kbId);
    return c.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load knowledge base';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

knowledgeBasesInternal.post('/:kbId/chunks/batch', async (c) => {
  const kbId = routeParam(c, 'kbId');
  if (!kbId) return c.json({ error: 'Knowledge base id is required' }, 400);

  const body = await c.req.json<{ items?: KbChunkBatchItem[] }>().catch(() => ({}));
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'items is required' }, 400);
  }

  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
  if (kb.type !== 'rag') return c.json({ error: 'Knowledge base is not RAG type' }, 400);

  try {
    const inserted = await batchInsertKbChunks(kbId, items, kb.embeddingDimensions);
    return c.json({ ok: true, inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to insert chunks';
    return c.json({ error: message }, 400);
  }
});

knowledgeBasesInternal.delete('/:kbId/documents/:documentId/chunks', async (c) => {
  const kbId = routeParam(c, 'kbId');
  const documentId = routeParam(c, 'documentId');
  if (!kbId || !documentId) {
    return c.json({ error: 'Knowledge base id and document id are required' }, 400);
  }

  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);

  const deleted = await deleteKbChunksForDocument(kbId, documentId);
  return c.json({ ok: true, deleted });
});

knowledgeBasesInternal.put('/:kbId/chunk-documents/:documentId', async (c) => {
  const kbId = routeParam(c, 'kbId');
  const documentId = routeParam(c, 'documentId');
  if (!kbId || !documentId) {
    return c.json({ error: 'Knowledge base id and document id are required' }, 400);
  }

  const body = await c.req
    .json<{
      document_name?: string;
      channel_path?: string;
      index_status?: KbChunkDocumentIndexStatus;
      index_error?: string | null;
    }>()
    .catch(() => ({}));

  if (!body.index_status) {
    return c.json({ error: 'index_status is required' }, 400);
  }
  if (!['pending', 'indexing', 'indexed', 'failed'].includes(body.index_status)) {
    return c.json({ error: 'Invalid index_status' }, 400);
  }

  try {
    const row = await upsertKbChunkDocumentFromWorker(kbId, documentId, {
      document_name: body.document_name,
      channel_path: body.channel_path,
      index_status: body.index_status,
      index_error: body.index_error,
    });
    return c.json({
      ok: true,
      document: {
        id: row.id,
        document_id: row.documentId,
        index_status: row.indexStatus,
        index_error: row.indexError,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upsert chunk document';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

knowledgeBasesInternal.put('/:kbId/items/:documentId', async (c) => {
  const kbId = routeParam(c, 'kbId');
  const documentId = routeParam(c, 'documentId');
  if (!kbId || !documentId) return c.json({ error: 'Knowledge base id and document id are required' }, 400);

  const body = await c.req.json<{
    document_name?: string;
    channel_path?: string;
    original_s3_key?: string;
    metadata?: Record<string, unknown> | null;
    page_index?: Record<string, unknown> | null;
    markdown?: string | null;
    markdown_s3_key?: string | null;
    parsing_result?: Record<string, unknown> | null;
    import_status?: KbItemImportStatus;
    import_error?: string | null;
    import_warnings?: string[] | null;
  }>().catch(() => ({}));

  if (!body.import_status) {
    return c.json({ error: 'import_status is required' }, 400);
  }

  try {
    const row = await upsertKbItemFromWorker(kbId, documentId, {
      document_name: body.document_name,
      channel_path: body.channel_path,
      original_s3_key: body.original_s3_key,
      metadata: body.metadata,
      page_index: body.page_index,
      markdown: body.markdown,
      markdown_s3_key: body.markdown_s3_key,
      parsing_result: body.parsing_result,
      import_status: body.import_status,
      import_error: body.import_error,
      import_warnings: body.import_warnings,
    });
    return c.json({
      ok: true,
      item: {
        id: row.id,
        document_id: row.documentId,
        import_status: row.importStatus,
        import_warnings: row.importWarnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upsert KB item';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

knowledgeBasesInternal.get('/:kbId/faqs', async (c) => {
  const kbId = routeParam(c, 'kbId');
  if (!kbId) return c.json({ error: 'Knowledge base id is required' }, 400);

  const faqIds = (c.req.query('faq_ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (faqIds.length === 0) return c.json({ error: 'faq_ids query is required' }, 400);

  try {
    const items = await getKbFaqsForWorker(kbId, faqIds);
    return c.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list FAQs';
    return c.json({ error: message }, 400);
  }
});

knowledgeBasesInternal.post('/:kbId/faqs/batch', async (c) => {
  const kbId = routeParam(c, 'kbId');
  if (!kbId) return c.json({ error: 'Knowledge base id is required' }, 400);

  const body = await c.req.json<{
    items?: Array<{
      question: string;
      answer: string;
      source_document_id?: string | null;
      source_document_name?: string | null;
      doc_metadata?: Record<string, unknown> | null;
    }>;
  }>().catch(() => ({}));

  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'items is required' }, 400);
  }

  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
  if (kb.type !== 'faq') return c.json({ error: 'Knowledge base is not FAQ type' }, 400);

  try {
    const inserted = await batchCreateKbFaqsFromWorker(kbId, items);
    return c.json({ ok: true, inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to batch create FAQs';
    return c.json({ error: message }, 400);
  }
});

knowledgeBasesInternal.put('/:kbId/faqs/:faqId', async (c) => {
  const kbId = routeParam(c, 'kbId');
  const faqId = routeParam(c, 'faqId');
  if (!kbId || !faqId) return c.json({ error: 'Knowledge base id and FAQ id are required' }, 400);

  const body = await c.req.json<{
    embedding?: string;
    index_status?: 'indexed' | 'failed';
    index_error?: string | null;
    doc_metadata?: Record<string, unknown> | null;
  }>().catch(() => ({}));

  if (!body.index_status) return c.json({ error: 'index_status is required' }, 400);

  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);

  let docMetadata = body.doc_metadata;
  if (docMetadata === undefined) {
    docMetadata = await refreshFaqDocMetadataForIndex(kbId, faqId);
  }

  try {
    const faq = await updateKbFaqFromWorker(kbId, faqId, {
      embedding: body.embedding,
      index_status: body.index_status,
      index_error: body.index_error,
      doc_metadata: docMetadata,
    }, kb.embeddingDimensions);
    return c.json({ ok: true, faq });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update FAQ';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

export default knowledgeBasesInternal;
