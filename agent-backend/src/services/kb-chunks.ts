import { and, desc, eq, sql } from 'drizzle-orm';
import {
  appDocumentChannels,
  appKbChunks,
  appKnowledgeBases,
  db,
} from '../db/index.ts';
import { buildChannelPath } from './channel-tree.ts';
import { getDocumentById } from './documents.ts';
import { decodeEmbeddingBase64 } from '../shared/kb-chunk-embedding.ts';

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

export type KbChunkBatchItem = {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding: string;
  chunk_metadata?: Record<string, unknown> | null;
  doc_metadata?: Record<string, unknown> | null;
  content_hash?: string | null;
};

export async function deleteKbChunksForDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<number> {
  const deleted = await db
    .delete(appKbChunks)
    .where(
      and(
        eq(appKbChunks.knowledgeBaseId, knowledgeBaseId),
        eq(appKbChunks.documentId, documentId),
      ),
    )
    .returning({ id: appKbChunks.id });
  return deleted.length;
}

export async function batchInsertKbChunks(
  knowledgeBaseId: string,
  items: KbChunkBatchItem[],
  expectedDimensions: number,
): Promise<number> {
  if (items.length === 0) return 0;

  const now = new Date();
  const rows = items.map((item) => {
    const embedding = decodeEmbeddingBase64(item.embedding);
    if (embedding.length !== expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch for chunk ${item.id}: expected ${expectedDimensions}, got ${embedding.length}`,
      );
    }
    return {
      id: item.id,
      knowledgeBaseId,
      documentId: item.document_id,
      chunkIndex: item.chunk_index,
      content: item.content,
      embedding,
      chunkMetadata: item.chunk_metadata ?? null,
      docMetadata: item.doc_metadata ?? null,
      contentHash: item.content_hash ?? null,
      indexedAt: now,
      createdAt: now,
    };
  });

  await db.insert(appKbChunks).values(rows);
  return rows.length;
}

export async function countKbChunks(knowledgeBaseId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId));
  return row?.count ?? 0;
}

export async function countIndexedDocuments(knowledgeBaseId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${appKbChunks.documentId})::int` })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId));
  return row?.count ?? 0;
}

export async function listIndexedDocuments(
  knowledgeBaseId: string,
  input?: { offset?: number; limit?: number },
) {
  const kb = await db
    .select({ id: appKnowledgeBases.id })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, knowledgeBaseId))
    .limit(1);
  if (!kb[0]) throw new Error('Knowledge base not found');

  const offset = Math.max(input?.offset ?? 0, 0);
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);

  const aggregated = await db
    .select({
      documentId: appKbChunks.documentId,
      chunkCount: sql<number>`count(*)::int`,
      indexedAt: sql<Date>`max(${appKbChunks.indexedAt})`,
    })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId))
    .groupBy(appKbChunks.documentId)
    .orderBy(desc(sql`max(${appKbChunks.indexedAt})`))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${appKbChunks.documentId})::int` })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId));

  const channelRows = await allChannelRows();
  const items = [];
  for (const row of aggregated) {
    const doc = await getDocumentById(row.documentId);
    if (!doc) continue;
    const channelPath = buildChannelPath(doc.channelId, channelRows);
    items.push({
      document_id: row.documentId,
      document_name: doc.name,
      channel_path: channelPath,
      chunk_count: row.chunkCount,
      indexed_at: row.indexedAt.toISOString(),
      status: 'indexed' as const,
    });
  }

  return { items, total: countRow?.count ?? 0 };
}

export async function getDistinctIndexedDocumentIds(knowledgeBaseId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ documentId: appKbChunks.documentId })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId));
  return rows.map((r) => r.documentId);
}
