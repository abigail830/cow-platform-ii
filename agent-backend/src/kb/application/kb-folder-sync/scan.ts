import { and, eq, inArray } from 'drizzle-orm';
import {
  appDocumentChannels,
  appDocuments,
  appKbChunkDocuments,
  appKbItems,
  db,
} from '../../../infrastructure/db/index.ts';
import { reconcileDoneCaptureLibraryDocuments } from '../../../document/application/document-capture-library-document.ts';
import {
  expandBoundChannelIds,
  folderSyncBatchSize,
} from '../../domain/folder-sync-match.ts';
import {
  deleteKbItem,
  getActiveKbImportJobForKnowledgeBase,
  getKnowledgeBaseById,
} from '../knowledge-bases.ts';
import { deleteKbChunksForDocument } from '../kb-chunks.ts';
import type { KnowledgeBaseType } from '../knowledge-bases.ts';

type DocRow = {
  id: string;
  channelId: string;
  updatedAt: Date;
  name: string;
};

type KbItemRow = {
  documentId: string;
  importStatus: string;
  syncManaged: boolean;
  updatedAt: Date;
  documentName: string;
  importError: string | null;
};

type ChunkDocRow = {
  documentId: string;
  indexStatus: string;
  syncManaged: boolean;
  updatedAt: Date;
  documentName: string;
  indexError: string | null;
};

async function allChannelRows() {
  const rows = await db
    .select({
      id: appDocumentChannels.id,
      parentId: appDocumentChannels.parentId,
    })
    .from(appDocumentChannels);
  return rows.map((r) => ({ id: r.id, parent_id: r.parentId }));
}

function docNeedsSyncPageIndex(doc: DocRow, item: KbItemRow | undefined, failedOnly: boolean): boolean {
  if (!item) return !failedOnly;
  if (item.importStatus === 'failed') return true;
  if (failedOnly) return false;
  if (!item.syncManaged) return false;
  if (item.importStatus === 'completed') {
    return doc.updatedAt.getTime() > item.updatedAt.getTime();
  }
  return item.importStatus === 'pending';
}

function docNeedsSyncRag(doc: DocRow, row: ChunkDocRow | undefined, failedOnly: boolean): boolean {
  if (!row) return !failedOnly;
  if (row.indexStatus === 'failed') return true;
  if (failedOnly) return false;
  if (!row.syncManaged) return false;
  if (row.indexStatus === 'indexed') {
    return doc.updatedAt.getTime() > row.updatedAt.getTime();
  }
  return row.indexStatus === 'pending' || row.indexStatus === 'indexing';
}

export type FolderSyncScanResult = {
  unsynced_ids: string[];
  unsynced_count: number;
  failed_count: number;
  failed_documents: Array<{
    document_id: string;
    document_name: string;
    error_message: string | null;
  }>;
};

export async function listUnsyncedDocumentIds(input: {
  knowledgeBaseId: string;
  boundChannelIds: string[];
  includeSubfolders: boolean;
  kbType: KnowledgeBaseType;
  failedOnly?: boolean;
  limit?: number;
}): Promise<FolderSyncScanResult> {
  if (input.boundChannelIds.length === 0) {
    return { unsynced_ids: [], unsynced_count: 0, failed_count: 0, failed_documents: [] };
  }

  const channelRows = await allChannelRows();
  const expanded = expandBoundChannelIds(
    input.boundChannelIds,
    input.includeSubfolders,
    channelRows,
  );
  const channelIdList = [...expanded];
  if (channelIdList.length === 0) {
    return { unsynced_ids: [], unsynced_count: 0, failed_count: 0, failed_documents: [] };
  }

  await reconcileDoneCaptureLibraryDocuments(channelIdList);

  const activeJob = await getActiveKbImportJobForKnowledgeBase(input.knowledgeBaseId);
  const inFlight = new Set(activeJob?.documentIds ?? []);

  const docs = await db
    .select({
      id: appDocuments.id,
      channelId: appDocuments.channelId,
      updatedAt: appDocuments.updatedAt,
      name: appDocuments.name,
    })
    .from(appDocuments)
    .where(
      and(
        inArray(appDocuments.channelId, channelIdList),
        eq(appDocuments.status, 'completed'),
      ),
    );

  let itemByDoc = new Map<string, KbItemRow>();
  let chunkDocByDoc = new Map<string, ChunkDocRow>();

  if (input.kbType === 'page_index') {
    const items = await db
      .select({
        documentId: appKbItems.documentId,
        importStatus: appKbItems.importStatus,
        syncManaged: appKbItems.syncManaged,
        updatedAt: appKbItems.updatedAt,
        documentName: appKbItems.documentName,
        importError: appKbItems.importError,
      })
      .from(appKbItems)
      .where(eq(appKbItems.knowledgeBaseId, input.knowledgeBaseId));
    itemByDoc = new Map(items.map((i) => [i.documentId, i]));
  } else if (input.kbType === 'rag') {
    const rows = await db
      .select({
        documentId: appKbChunkDocuments.documentId,
        indexStatus: appKbChunkDocuments.indexStatus,
        syncManaged: appKbChunkDocuments.syncManaged,
        updatedAt: appKbChunkDocuments.updatedAt,
        documentName: appKbChunkDocuments.documentName,
        indexError: appKbChunkDocuments.indexError,
      })
      .from(appKbChunkDocuments)
      .where(eq(appKbChunkDocuments.knowledgeBaseId, input.knowledgeBaseId));
    chunkDocByDoc = new Map(rows.map((r) => [r.documentId, r]));
  }

  const unsynced: string[] = [];
  const failedDocuments: FolderSyncScanResult['failed_documents'] = [];

  for (const doc of docs) {
    if (inFlight.has(doc.id)) continue;

    if (input.kbType === 'page_index') {
      const item = itemByDoc.get(doc.id);
      if (item?.importStatus === 'failed') {
        failedDocuments.push({
          document_id: doc.id,
          document_name: item.documentName,
          error_message: item.importError,
        });
      }
      if (docNeedsSyncPageIndex(doc, item, Boolean(input.failedOnly))) {
        unsynced.push(doc.id);
      }
    } else if (input.kbType === 'rag') {
      const row = chunkDocByDoc.get(doc.id);
      if (row?.indexStatus === 'failed') {
        failedDocuments.push({
          document_id: doc.id,
          document_name: row.documentName,
          error_message: row.indexError,
        });
      }
      if (docNeedsSyncRag(doc, row, Boolean(input.failedOnly))) {
        unsynced.push(doc.id);
      }
    }
  }

  const limit = input.limit ?? folderSyncBatchSize();
  return {
    unsynced_ids: unsynced.slice(0, limit),
    unsynced_count: unsynced.length,
    failed_count: failedDocuments.length,
    failed_documents: failedDocuments.slice(0, 50),
  };
}

export async function reconcileSyncManagedMoveOut(input: {
  knowledgeBaseId: string;
  boundChannelIds: string[];
  includeSubfolders: boolean;
  kbType: KnowledgeBaseType;
}): Promise<number> {
  if (input.boundChannelIds.length === 0) return 0;

  const channelRows = await allChannelRows();
  const expanded = expandBoundChannelIds(
    input.boundChannelIds,
    input.includeSubfolders,
    channelRows,
  );

  let removed = 0;

  if (input.kbType === 'page_index') {
    const managed = await db
      .select({
        id: appKbItems.id,
        documentId: appKbItems.documentId,
      })
      .from(appKbItems)
      .where(
        and(
          eq(appKbItems.knowledgeBaseId, input.knowledgeBaseId),
          eq(appKbItems.syncManaged, true),
        ),
      );
    for (const item of managed) {
      const [doc] = await db
        .select({ channelId: appDocuments.channelId })
        .from(appDocuments)
        .where(eq(appDocuments.id, item.documentId))
        .limit(1);
      if (!doc || !expanded.has(doc.channelId)) {
        await deleteKbItem(input.knowledgeBaseId, item.id);
        removed += 1;
      }
    }
  } else if (input.kbType === 'rag') {
    const managed = await db
      .select({ documentId: appKbChunkDocuments.documentId })
      .from(appKbChunkDocuments)
      .where(
        and(
          eq(appKbChunkDocuments.knowledgeBaseId, input.knowledgeBaseId),
          eq(appKbChunkDocuments.syncManaged, true),
        ),
      );
    for (const row of managed) {
      const [doc] = await db
        .select({ channelId: appDocuments.channelId })
        .from(appDocuments)
        .where(eq(appDocuments.id, row.documentId))
        .limit(1);
      if (!doc || !expanded.has(doc.channelId)) {
        await deleteKbChunksForDocument(input.knowledgeBaseId, row.documentId);
        removed += 1;
      }
    }
  }

  return removed;
}

export async function getFolderSyncStats(knowledgeBaseId: string): Promise<{
  unsynced_count: number;
  failed_count: number;
  failed_documents: FolderSyncScanResult['failed_documents'];
}> {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb || kb.type === 'faq') {
    return { unsynced_count: 0, failed_count: 0, failed_documents: [] };
  }

  const { getFolderSyncByKnowledgeBaseId } = await import('./config.ts');
  const config = await getFolderSyncByKnowledgeBaseId(knowledgeBaseId);
  if (!config || config.channelIds.length === 0) {
    return { unsynced_count: 0, failed_count: 0, failed_documents: [] };
  }

  const scan = await listUnsyncedDocumentIds({
    knowledgeBaseId,
    boundChannelIds: config.channelIds,
    includeSubfolders: config.row.includeSubfolders,
    kbType: kb.type,
    limit: Number.MAX_SAFE_INTEGER,
  });

  return {
    unsynced_count: scan.unsynced_count,
    failed_count: scan.failed_count,
    failed_documents: scan.failed_documents,
  };
}
