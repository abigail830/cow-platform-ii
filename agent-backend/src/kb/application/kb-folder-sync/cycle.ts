import { and, eq, inArray } from 'drizzle-orm';
import {
  appKbChunkDocuments,
  appKbItems,
  db,
} from '../../../infrastructure/db/index.ts';
import { spawnKbImportWorker } from '../../infrastructure/kb-import-runner.ts';
import {
  getActiveKbImportJobForKnowledgeBase,
  getKbImportJobById,
  getKnowledgeBaseById,
  startKbPageIndexImport,
  startKbRagIndexImport,
} from '../knowledge-bases.ts';
import { getFolderSyncByKnowledgeBaseId, touchLastAutoSyncAt } from './config.ts';
import { listUnsyncedDocumentIds, reconcileSyncManagedMoveOut } from './scan.ts';
import { notifyFolderSyncPartialFailure } from './notifications.ts';

export type FolderSyncCycleSource = 'manual' | 'auto' | 'chain' | 'retry';

export type FolderSyncCycleResult = {
  status: 'idle' | 'skipped' | 'dispatched' | 'unsupported';
  reason?: string;
  batch_size?: number;
  remaining?: number;
  removed?: number;
  job_id?: string;
};

export async function runFolderSyncCycle(input: {
  knowledgeBaseId: string;
  source: FolderSyncCycleSource;
  failedOnly?: boolean;
  documentIds?: string[];
  createdBy?: string | null;
  advanceAutoSyncClock?: boolean;
}): Promise<FolderSyncCycleResult> {
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type === 'faq') {
    return { status: 'unsupported', reason: 'faq_not_supported' };
  }

  const config = await getFolderSyncByKnowledgeBaseId(input.knowledgeBaseId);
  if (!config || config.channelIds.length === 0) {
    return { status: 'idle', reason: 'no_folders_bound' };
  }

  if (await getActiveKbImportJobForKnowledgeBase(input.knowledgeBaseId)) {
    return { status: 'skipped', reason: 'import_in_progress' };
  }

  if (input.advanceAutoSyncClock && input.source === 'auto') {
    await touchLastAutoSyncAt(config.row.id);
  }

  const removed = await reconcileSyncManagedMoveOut({
    knowledgeBaseId: input.knowledgeBaseId,
    boundChannelIds: config.channelIds,
    includeSubfolders: config.row.includeSubfolders,
    kbType: kb.type,
  });

  let documentIds: string[] = [];
  if (input.documentIds && input.documentIds.length > 0) {
    documentIds = [...new Set(input.documentIds)];
  } else {
    const scan = await listUnsyncedDocumentIds({
      knowledgeBaseId: input.knowledgeBaseId,
      boundChannelIds: config.channelIds,
      includeSubfolders: config.row.includeSubfolders,
      kbType: kb.type,
      failedOnly: input.failedOnly,
    });
    documentIds = scan.unsynced_ids;
    if (documentIds.length === 0) {
      return { status: 'idle', removed, reason: 'nothing_to_sync' };
    }
  }

  const importInput = {
    knowledgeBaseId: input.knowledgeBaseId,
    documentIds,
    createdBy: input.createdBy ?? config.row.createdBy,
    fromFolderSync: true,
  };

  const result =
    kb.type === 'page_index'
      ? await startKbPageIndexImport(importInput)
      : await startKbRagIndexImport(importInput);

  await spawnKbImportWorker(result.job.id);

  return {
    status: 'dispatched',
    batch_size: result.document_count,
    removed,
    job_id: result.job.id,
  };
}

async function listFailedDocsFromJob(
  knowledgeBaseId: string,
  kbType: 'page_index' | 'rag',
  documentIds: string[],
): Promise<Array<{ document_id: string; document_name: string; error_message: string | null }>> {
  if (documentIds.length === 0) return [];

  if (kbType === 'page_index') {
    const rows = await db
      .select({
        documentId: appKbItems.documentId,
        documentName: appKbItems.documentName,
        importError: appKbItems.importError,
        importStatus: appKbItems.importStatus,
      })
      .from(appKbItems)
      .where(
        and(
          eq(appKbItems.knowledgeBaseId, knowledgeBaseId),
          inArray(appKbItems.documentId, documentIds),
        ),
      );
    return rows
      .filter((r) => r.importStatus === 'failed')
      .map((r) => ({
        document_id: r.documentId,
        document_name: r.documentName,
        error_message: r.importError,
      }));
  }

  const rows = await db
    .select({
      documentId: appKbChunkDocuments.documentId,
      documentName: appKbChunkDocuments.documentName,
      indexError: appKbChunkDocuments.indexError,
      indexStatus: appKbChunkDocuments.indexStatus,
    })
    .from(appKbChunkDocuments)
    .where(
      and(
        eq(appKbChunkDocuments.knowledgeBaseId, knowledgeBaseId),
        inArray(appKbChunkDocuments.documentId, documentIds),
      ),
    );
  return rows
    .filter((r) => r.indexStatus === 'failed')
    .map((r) => ({
      document_id: r.documentId,
      document_name: r.documentName,
      error_message: r.indexError,
    }));
}

export async function onKbFolderSyncImportJobTerminal(input: {
  jobId: string;
  status: 'completed' | 'failed';
  failedCount?: number;
}): Promise<void> {
  const job = await getKbImportJobById(input.jobId);
  if (!job?.metrics?.folder_sync) return;

  const kb = await getKnowledgeBaseById(job.knowledgeBaseId);
  if (!kb || kb.type === 'faq') return;

  const failedCount = input.failedCount ?? job.failedCount ?? 0;
  if (failedCount > 0) {
    const failedDocs = await listFailedDocsFromJob(
      job.knowledgeBaseId,
      kb.type,
      job.documentIds,
    );
    await notifyFolderSyncPartialFailure({
      knowledgeBaseId: job.knowledgeBaseId,
      knowledgeBaseName: kb.name,
      importJobId: job.id,
      failedDocuments: failedDocs,
      notifyUserId: job.createdBy ?? (await getFolderSyncByKnowledgeBaseId(job.knowledgeBaseId))?.row.createdBy ?? null,
    });
  }

  if (input.status === 'completed' || (input.status === 'failed' && (job.completedCount ?? 0) > 0)) {
    try {
      await runFolderSyncCycle({
        knowledgeBaseId: job.knowledgeBaseId,
        source: 'chain',
        createdBy: job.createdBy,
      });
    } catch (error) {
      console.error('[kb-folder-sync] chain dispatch after import job failed:', error);
    }
  }
}
