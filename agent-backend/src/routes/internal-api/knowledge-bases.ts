import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  batchInsertKbChunks,
  deleteKbChunksForDocument,
  type KbChunkBatchItem,
} from '../../services/kb-chunks.ts';
import {
  getKbWorkerConfig,
  getKnowledgeBaseById,
  upsertKbItemFromWorker,
  type KbItemImportStatus,
} from '../../services/knowledge-bases.ts';

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

export default knowledgeBasesInternal;
