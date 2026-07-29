import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { appDocuments, db } from '../../db/index.ts';
import { getChannelById, getDocumentById } from '../../services/documents.ts';
import { uploadDocumentObject, StorageNotConfiguredError } from '../../storage/document-files.ts';
import { isStorageEnabled } from '../../storage/s3-config.ts';

const documents = new Hono();

documents.use('*', requireCliInternalAuth);

function storagePrefixFromS3Key(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

function metadataNeedsExtraction(
  metadata: Record<string, unknown> | null | undefined,
  hasExtractionModel: boolean,
): boolean {
  if (!hasExtractionModel) return false;
  const values = Object.values(metadata ?? {});
  if (values.length === 0) return true;
  return values.every((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

documents.get('/:id', async (c) => {
  const doc = await getDocumentById(c.req.param('id'));
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
  const doc = await getDocumentById(c.req.param('id'));
  if (!doc) return c.json({ error: 'Document not found' }, 404);
  const channel = await getChannelById(doc.channelId);
  if (!channel) return c.json({ error: 'Channel not found' }, 404);
  return c.json({
    needs_extraction: metadataNeedsExtraction(
      doc.metadata as Record<string, unknown>,
      Boolean(channel.metadataExtractionModelId),
    ),
  });
});

documents.put('/:id/markdown', async (c) => {
  if (!isStorageEnabled()) return c.json({ error: 'Object storage is not configured' }, 503);

  const doc = await getDocumentById(c.req.param('id'));
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  const body = await c.req.json<{ markdown?: string }>().catch(() => ({}));
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
  const doc = await getDocumentById(c.req.param('id'));
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  const body = await c.req.json<{ metadata?: Record<string, unknown> }>().catch(() => ({}));
  if (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata)) {
    return c.json({ error: 'metadata object is required' }, 400);
  }

  const merged = { ...(doc.metadata ?? {}), ...body.metadata };
  await db
    .update(appDocuments)
    .set({ metadata: merged, updatedAt: new Date() })
    .where(eq(appDocuments.id, doc.id));

  return c.json({ ok: true, metadata: merged });
});

documents.post('/:id/versions', async (c) => {
  const doc = await getDocumentById(c.req.param('id'));
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Version snapshots are not persisted yet; acknowledge pipeline completion.
  await db.update(appDocuments).set({ updatedAt: new Date() }).where(eq(appDocuments.id, doc.id));
  return c.json({ ok: true });
});

export default documents;
