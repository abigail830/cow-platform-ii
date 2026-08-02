import type { KbChunkDocumentIndexStatus } from '../services/kb-chunk-documents.ts';

export type RagChunkAggregate = {
  documentId: string;
  chunkCount: number;
  indexedAt: Date | null;
};

export type RagChunkDocumentRow = {
  documentId: string;
  documentName: string;
  channelPath: string;
  indexStatus: string;
  indexError: string | null;
  indexedAt: Date | null;
  updatedAt: Date;
};

export type MergedRagIndexedDocument = {
  documentId: string;
  sortAt: number;
  statusRow: RagChunkDocumentRow | null;
  chunkCount: number | null;
  indexedAt: Date | null;
};

export function countDistinctRagIndexedDocuments(input: {
  chunkDocumentIds: string[];
  statusRows: RagChunkDocumentRow[];
}): number {
  const chunkIds = new Set(input.chunkDocumentIds);
  let total = chunkIds.size;
  for (const row of input.statusRows) {
    if (!chunkIds.has(row.documentId)) total += 1;
  }
  return total;
}

export function mergeRagIndexedDocuments(input: {
  chunkAggregates: RagChunkAggregate[];
  statusRows: RagChunkDocumentRow[];
}): MergedRagIndexedDocument[] {
  const chunkByDoc = new Map(
    input.chunkAggregates.map((row) => [
      row.documentId,
      { chunkCount: row.chunkCount, indexedAt: row.indexedAt },
    ]),
  );
  const statusByDoc = new Map(input.statusRows.map((row) => [row.documentId, row]));
  const documentIds = new Set<string>([...chunkByDoc.keys(), ...statusByDoc.keys()]);

  const merged = [...documentIds].map((documentId) => {
    const statusRow = statusByDoc.get(documentId) ?? null;
    const chunk = chunkByDoc.get(documentId);
    const indexedAt = chunk?.indexedAt ?? statusRow?.indexedAt ?? null;
    const statusUpdatedAt = statusRow?.updatedAt ?? null;
    const sortAt = Math.max(
      indexedAt instanceof Date ? indexedAt.getTime() : indexedAt ? new Date(indexedAt).getTime() : 0,
      statusUpdatedAt instanceof Date
        ? statusUpdatedAt.getTime()
        : statusUpdatedAt
          ? new Date(statusUpdatedAt).getTime()
          : 0,
    );
    return {
      documentId,
      sortAt,
      statusRow,
      chunkCount: chunk?.chunkCount ?? null,
      indexedAt: indexedAt instanceof Date ? indexedAt : indexedAt ? new Date(indexedAt) : null,
    };
  });

  merged.sort((a, b) => b.sortAt - a.sortAt);
  return merged;
}

export function resolveRagIndexedDocumentStatus(input: {
  statusRow: RagChunkDocumentRow | null;
  chunkCount: number | null;
}): KbChunkDocumentIndexStatus {
  const rowStatus = input.statusRow?.indexStatus;
  if (rowStatus === 'failed' || rowStatus === 'indexing' || rowStatus === 'pending') {
    return rowStatus;
  }
  if ((input.chunkCount ?? 0) > 0 || rowStatus === 'indexed') {
    return 'indexed';
  }
  return (rowStatus as KbChunkDocumentIndexStatus | undefined) ?? 'indexed';
}

export function collectRagReindexDocumentIds(input: {
  chunkDocumentIds: string[];
  statusRows: RagChunkDocumentRow[];
}): string[] {
  const chunkIds = new Set(input.chunkDocumentIds);
  const ids = new Set<string>(chunkIds);
  for (const row of input.statusRows) {
    if (row.indexStatus === 'indexed') {
      ids.add(row.documentId);
    }
  }
  return [...ids];
}
