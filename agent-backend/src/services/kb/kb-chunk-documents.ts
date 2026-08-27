import { and, eq } from 'drizzle-orm';
import { appDocumentChannels, appKbChunkDocuments, appKnowledgeBases, db } from '../../db/index.ts';
import { buildChannelPath } from '../channels/channel-tree.ts';
import { getDocumentById } from '../documents/documents.ts';

export type KbChunkDocumentIndexStatus = 'pending' | 'indexing' | 'indexed' | 'failed';

async function allChannelRows() {
  const rows = await db
    .select({
      id: appDocumentChannels.id,
      name: appDocumentChannels.name,
      parentId: appDocumentChannels.parentId,
    })
    .from(appDocumentChannels);
  return rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId }));
}

export async function getKbChunkDocumentByDocumentId(
  knowledgeBaseId: string,
  documentId: string,
) {
  const [row] = await db
    .select()
    .from(appKbChunkDocuments)
    .where(
      and(
        eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId),
        eq(appKbChunkDocuments.documentId, documentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertKbChunkDocumentIndexing(
  knowledgeBaseId: string,
  documentId: string,
): Promise<void> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const channelRows = await allChannelRows();
  const channelPath = buildChannelPath(doc.channelId, channelRows);
  const now = new Date();

  const existing = await getKbChunkDocumentByDocumentId(knowledgeBaseId, documentId);
  if (existing) {
    await db
      .update(appKbChunkDocuments)
      .set({
        documentName: doc.name,
        channelPath,
        indexStatus: 'indexing',
        indexError: null,
        updatedAt: now,
      })
      .where(eq(appKbChunkDocuments.id, existing.id));
    return;
  }

  await db.insert(appKbChunkDocuments).values({
    knowledgeBaseId,
    documentId,
    documentName: doc.name,
    channelPath,
    indexStatus: 'indexing',
  });
}

export async function upsertKbChunkDocumentFromWorker(
  knowledgeBaseId: string,
  documentId: string,
  input: {
    document_name?: string;
    channel_path?: string;
    index_status: KbChunkDocumentIndexStatus;
    index_error?: string | null;
  },
) {
  const [kb] = await db
    .select({ id: appKnowledgeBases.id, type: appKnowledgeBases.type })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, knowledgeBaseId))
    .limit(1);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'rag') throw new Error('Knowledge base is not RAG type');

  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error('Document not found');

  const channelRows = await allChannelRows();
  const channelPath = input.channel_path ?? buildChannelPath(doc.channelId, channelRows);
  const documentName = input.document_name ?? doc.name;
  const indexError = input.index_status === 'failed' ? (input.index_error?.slice(0, 500) ?? null) : null;
  const now = new Date();
  const indexedAt = input.index_status === 'indexed' ? now : null;

  const existing = await getKbChunkDocumentByDocumentId(knowledgeBaseId, documentId);
  if (existing) {
    const [row] = await db
      .update(appKbChunkDocuments)
      .set({
        documentName,
        channelPath,
        indexStatus: input.index_status,
        indexError,
        indexedAt: indexedAt ?? existing.indexedAt,
        updatedAt: now,
      })
      .where(eq(appKbChunkDocuments.id, existing.id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(appKbChunkDocuments)
    .values({
      knowledgeBaseId,
      documentId,
      documentName,
      channelPath,
      indexStatus: input.index_status,
      indexError,
      indexedAt,
    })
    .returning();
  return row!;
}

export async function deleteKbChunkDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<void> {
  await db
    .delete(appKbChunkDocuments)
    .where(
      and(
        eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId),
        eq(appKbChunkDocuments.documentId, documentId),
      ),
    );
}

export async function countKbChunkDocuments(knowledgeBaseId: string): Promise<number> {
  const rows = await db
    .select({ id: appKbChunkDocuments.id })
    .from(appKbChunkDocuments)
    .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId));
  return rows.length;
}
