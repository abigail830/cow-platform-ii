import { and, asc, eq, sql } from 'drizzle-orm';
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
  collectRagReindexDocumentIds,
  countDistinctRagIndexedDocuments,
  mergeRagIndexedDocuments,
  resolveRagIndexedDocumentStatus,
  type RagChunkDocumentRow,
} from '../shared/kb-indexed-documents-merge.ts';
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

function toStatusRows(
  rows: Array<{
    documentId: string;
    documentName: string;
    channelPath: string;
    indexStatus: string;
    indexError: string | null;
    indexedAt: Date | null;
    updatedAt: Date;
  }>,
): RagChunkDocumentRow[] {
  return rows.map((row) => ({
    documentId: row.documentId,
    documentName: row.documentName,
    channelPath: row.channelPath,
    indexStatus: row.indexStatus,
    indexError: row.indexError,
    indexedAt: row.indexedAt,
    updatedAt: row.updatedAt,
  }));
}

async function loadChunkAggregates(knowledgeBaseId: string) {
  return db
    .select({
      documentId: appKbChunks.documentId,
      chunkCount: sql<number>`count(*)::int`,
      indexedAt: sql<Date>`max(${appKbChunks.indexedAt})`,
    })
    .from(appKbChunks)
    .where(eq(appKbChunks.knowledgeBaseId, knowledgeBaseId))
    .groupBy(appKbChunks.documentId);
}

export async function countIndexedDocuments(knowledgeBaseId: string): Promise<number> {
  const [chunkAggregates, statusRows] = await Promise.all([
    loadChunkAggregates(knowledgeBaseId),
    db
      .select({
        documentId: appKbChunkDocuments.documentId,
        documentName: appKbChunkDocuments.documentName,
        channelPath: appKbChunkDocuments.channelPath,
        indexStatus: appKbChunkDocuments.indexStatus,
        indexError: appKbChunkDocuments.indexError,
        indexedAt: appKbChunkDocuments.indexedAt,
        updatedAt: appKbChunkDocuments.updatedAt,
      })
      .from(appKbChunkDocuments)
      .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId)),
  ]);

  return countDistinctRagIndexedDocuments({
    chunkDocumentIds: chunkAggregates.map((row) => row.documentId),
    statusRows: toStatusRows(statusRows),
  });
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

  const [statusRows, chunkAggregates] = await Promise.all([
    db
      .select({
        documentId: appKbChunkDocuments.documentId,
        documentName: appKbChunkDocuments.documentName,
        channelPath: appKbChunkDocuments.channelPath,
        indexStatus: appKbChunkDocuments.indexStatus,
        indexError: appKbChunkDocuments.indexError,
        indexedAt: appKbChunkDocuments.indexedAt,
        updatedAt: appKbChunkDocuments.updatedAt,
      })
      .from(appKbChunkDocuments)
      .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId)),
    loadChunkAggregates(knowledgeBaseId),
  ]);

  const merged = mergeRagIndexedDocuments({
    chunkAggregates: chunkAggregates.map((row) => ({
      documentId: row.documentId,
      chunkCount: row.chunkCount,
      indexedAt:
        row.indexedAt instanceof Date
          ? row.indexedAt
          : row.indexedAt
            ? new Date(row.indexedAt)
            : null,
    })),
    statusRows: toStatusRows(statusRows),
  });

  const page = merged.slice(offset, offset + limit);

  const channelRows = await db
    .select({
      id: appDocumentChannels.id,
      name: appDocumentChannels.name,
      parentId: appDocumentChannels.parentId,
    })
    .from(appDocumentChannels);
  const channelTree = channelRows.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId }));

  const items: KbIndexedDocumentRow[] = [];
  for (const row of page) {
    const status = resolveRagIndexedDocumentStatus({
      statusRow: row.statusRow,
      chunkCount: row.chunkCount,
    });

    if (row.statusRow) {
      items.push({
        document_id: row.documentId,
        document_name: row.statusRow.documentName,
        channel_path: row.statusRow.channelPath,
        chunk_count: row.chunkCount,
        indexed_at: (row.statusRow.indexedAt ?? row.indexedAt)?.toISOString() ?? null,
        status,
        index_error: row.statusRow.indexError ?? null,
      });
      continue;
    }

    const doc = await getDocumentById(row.documentId);
    if (!doc) continue;
    items.push({
      document_id: row.documentId,
      document_name: doc.name,
      channel_path: buildChannelPath(doc.channelId, channelTree),
      chunk_count: row.chunkCount,
      indexed_at: row.indexedAt?.toISOString() ?? null,
      status,
      index_error: null,
    });
  }

  return { items, total: merged.length };
}

export async function getDistinctIndexedDocumentIds(knowledgeBaseId: string): Promise<string[]> {
  const [chunkAggregates, statusRows] = await Promise.all([
    loadChunkAggregates(knowledgeBaseId),
    db
      .select({
        documentId: appKbChunkDocuments.documentId,
        documentName: appKbChunkDocuments.documentName,
        channelPath: appKbChunkDocuments.channelPath,
        indexStatus: appKbChunkDocuments.indexStatus,
        indexError: appKbChunkDocuments.indexError,
        indexedAt: appKbChunkDocuments.indexedAt,
        updatedAt: appKbChunkDocuments.updatedAt,
      })
      .from(appKbChunkDocuments)
      .where(eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId)),
  ]);

  return collectRagReindexDocumentIds({
    chunkDocumentIds: chunkAggregates.map((row) => row.documentId),
    statusRows: toStatusRows(statusRows),
  });
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
