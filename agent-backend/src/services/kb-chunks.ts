import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  appDocumentChannels,
  appKbChunkDocuments,
  appKbChunks,
  appKnowledgeBases,
  db,
} from '../db/index.ts';
import { buildChannelPath } from './channel-tree.ts';
import { getDocumentById } from './documents.ts';
import { decodeEmbeddingBase64 } from '../shared/kb-chunk-embedding.ts';
import {
  deleteKbChunkDocument,
  type KbChunkDocumentIndexStatus,
} from './kb-chunk-documents.ts';

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
  await deleteKbChunkDocument(knowledgeBaseId, documentId);
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

async function loadChunkCountByDocument(knowledgeBaseId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      documentId: appKbChunks.documentId,
      chunkCount: sql<number>`count(*)::int`,
    })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId))
    .groupBy(appKbChunks.documentId);
  return new Map(rows.map((row) => [row.documentId, row.chunkCount]));
}

export async function countIndexedDocuments(knowledgeBaseId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appKbChunkDocuments)
    .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId));
  return row?.count ?? 0;
}

export type KbIndexedDocumentRow = {
  document_id: string;
  document_name: string;
  channel_path: string;
  chunk_count: number | null;
  indexed_at: string | null;
  status: KbChunkDocumentIndexStatus;
  index_error: string | null;
};

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

  const [countRow, rows, chunkCountByDoc] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(appKbChunkDocuments)
      .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId)),
    db
      .select()
      .from(appKbChunkDocuments)
      .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId))
      .orderBy(desc(appKbChunkDocuments.updatedAt))
      .limit(limit)
      .offset(offset),
    loadChunkCountByDocument(knowledgeBaseId),
  ]);

  const items: KbIndexedDocumentRow[] = rows.map((row) => ({
    document_id: row.documentId,
    document_name: row.documentName,
    channel_path: row.channelPath,
    chunk_count: chunkCountByDoc.get(row.documentId) ?? null,
    indexed_at: row.indexedAt?.toISOString() ?? null,
    status: row.indexStatus as KbChunkDocumentIndexStatus,
    index_error: row.indexError ?? null,
  }));

  return { items, total: countRow?.count ?? 0 };
}

export async function getDistinctIndexedDocumentIds(knowledgeBaseId: string): Promise<string[]> {
  const rows = await db
    .select({ documentId: appKbChunkDocuments.documentId })
    .from(appKbChunkDocuments)
    .where(
      and(
        eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId),
        eq(appKbChunkDocuments.indexStatus, 'indexed'),
      ),
    );
  return rows.map((r) => r.documentId);
}

export type KbChunkListItem = {
  id: string;
  chunk_index: number;
  content: string;
  chunk_metadata: Record<string, unknown> | null;
  doc_metadata: Record<string, unknown> | null;
  content_hash: string | null;
  indexed_at: string;
};

function formatChunkTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listKbChunksForDocument(
  knowledgeBaseId: string,
  documentId: string,
  input?: { offset?: number; limit?: number },
) {
  const kb = await db
    .select({ id: appKnowledgeBases.id })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, knowledgeBaseId))
    .limit(1);
  if (!kb[0]) throw new Error('Knowledge base not found');

  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error('Document not found');

  const offset = Math.max(input?.offset ?? 0, 0);
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);

  const rows = await db
    .select({
      id: appKbChunks.id,
      chunkIndex: appKbChunks.chunkIndex,
      content: appKbChunks.content,
      chunkMetadata: appKbChunks.chunkMetadata,
      docMetadata: appKbChunks.docMetadata,
      contentHash: appKbChunks.contentHash,
      indexedAt: appKbChunks.indexedAt,
    })
    .from(appKbChunks)
    .where(
      and(
        eq(appKbChunks.knowledgeBaseId, knowledgeBaseId),
        eq(appKbChunks.documentId, documentId),
      ),
    )
    .orderBy(asc(appKbChunks.chunkIndex))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appKbChunks)
    .where(
      and(
        eq(appKbChunks.knowledgeBaseId, knowledgeBaseId),
        eq(appKbChunks.documentId, documentId),
      ),
    );

  const channelRows = await db
    .select({
      id: appDocumentChannels.id,
      name: appDocumentChannels.name,
      parentId: appDocumentChannels.parentId,
    })
    .from(appDocumentChannels);
  const channelPath = buildChannelPath(
    doc.channelId,
    channelRows.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId })),
  );
  const indexedAt = rows.reduce<string | null>((latest, row) => {
    const value = formatChunkTimestamp(row.indexedAt);
    return latest == null || value > latest ? value : latest;
  }, null);

  const items: KbChunkListItem[] = rows.map((row) => ({
    id: row.id,
    chunk_index: row.chunkIndex,
    content: row.content,
    chunk_metadata: row.chunkMetadata ?? null,
    doc_metadata: row.docMetadata ?? null,
    content_hash: row.contentHash ?? null,
    indexed_at: formatChunkTimestamp(row.indexedAt),
  }));

  return {
    document_id: documentId,
    document_name: doc.name,
    channel_path: channelPath,
    chunk_count: countRow?.count ?? 0,
    indexed_at: indexedAt,
    items,
    total: countRow?.count ?? 0,
  };
}
