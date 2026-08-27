import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { appDocuments, db } from '../../db/index.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  getChannelById,
  getDocumentById,
  updateDocumentMetadata,
} from '../../services/documents/documents.ts';
import {
  buildDocumentImportContext,
} from '../../services/kb/knowledge-bases.ts';
import {
  metadataNeedsExtraction,
} from '../../services/documents/document-metadata-extraction.ts';
import { uploadDocumentObject, StorageNotConfiguredError } from '../../storage/document-files.ts';
import { isStorageEnabled } from '../../storage/s3-config.ts';

const documents = new Hono();

documents.use('*', requireCliInternalAuth);

function storagePrefixFromS3Key(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

documents.get('/:id/import-context', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Document id is required' }, 400);

  try {
    const ctx = await buildDocumentImportContext(id);
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load import context';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

documents.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Document id is required' }, 400);

  const doc = await getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);
  return c.json({
    id: doc.id,
    channel_id: doc.channelId,
    name: doc.name,
    file_hash: doc.fileHash,
    s3_key: doc.s3Key,
    status: doc.status,
    metadata: doc.metadata ?? {},
  });
});

documents.get('/:id/metadata-needs-extraction', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Document id is required' }, 400);

  const doc = await getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);
  return c.json({
    needs_extraction: metadataNeedsExtraction(doc.metadata as Record<string, unknown>),
  });
});

documents.put('/:id/markdown', async (c) => {
  if (!isStorageEnabled()) return c.json({ error: 'Object storage is not configured' }, 503);

  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Document id is required' }, 400);

  const doc = await getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  const body = await c.req.json<{ markdown?: string }>().catch(
    (): { markdown?: string } => ({}),
  );
  if (typeof body.markdown !== 'string') {
    return c.json({ error: 'markdown is required' }, 400);
  }

  const prefix = storagePrefixFromS3Key(doc.s3Key);
  const key = `${prefix}/markdown.md`;

  try {
    await uploadDocumentObject(key, Buffer.from(body.markdown, 'utf-8'), 'text/markdown');
    await db.update(appDocuments).set({ updatedAt: new Date() }).where(eq(appDocuments.id, doc.id));
    return c.json({ ok: true, key });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return c.json({ error: 'Object storage is not configured' }, 503);
    }
    return c.json({ error: error instanceof Error ? error.message : 'Upload failed' }, 500);
  }
});

documents.put('/:id/metadata', async (c) => {
  const body = await c.req.json<{ metadata?: Record<string, unknown> }>().catch(
    (): { metadata?: Record<string, unknown> } => ({}),
  );
  if (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata)) {
    return c.json({ error: 'metadata object is required' }, 400);
  }

  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Document id is required' }, 400);

  try {
    const result = await updateDocumentMetadata(id, body.metadata);
    return c.json({ ok: true, metadata: result.metadata });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update metadata';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

documents.post('/:id/versions', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Document id is required' }, 400);

  const doc = await getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Version snapshots are not persisted yet; acknowledge pipeline completion.
  await db.update(appDocuments).set({ updatedAt: new Date() }).where(eq(appDocuments.id, doc.id));
  return c.json({ ok: true });
});

export default documents;
