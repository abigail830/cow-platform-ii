import { runFolderSyncCycle } from './cycle.ts';
import { listAutoSyncConfigsDue } from './config.ts';
import { getActiveKbImportJobForKnowledgeBase } from '../knowledge-bases.ts';

export type KbFolderSyncCronResult = {
  checked: number;
  dispatched: number;
  skipped_in_progress: number;
  idle: number;
  errors: number;
};

export async function runKbFolderSyncCron(now = new Date()): Promise<KbFolderSyncCronResult> {
  const due = await listAutoSyncConfigsDue(now);
  const result: KbFolderSyncCronResult = {
    checked: due.length,
    dispatched: 0,
    skipped_in_progress: 0,
    idle: 0,
    errors: 0,
  };

  for (const { row } of due) {
    try {
      if (await getActiveKbImportJobForKnowledgeBase(row.knowledgeBaseId)) {
        result.skipped_in_progress += 1;
        continue;
      }

      const cycle = await runFolderSyncCycle({
        knowledgeBaseId: row.knowledgeBaseId,
        source: 'auto',
        advanceAutoSyncClock: true,
        createdBy: row.createdBy,
      });

      if (cycle.status === 'dispatched') result.dispatched += 1;
      else if (cycle.status === 'idle') result.idle += 1;
      else if (cycle.status === 'skipped') result.skipped_in_progress += 1;
    } catch (error) {
      result.errors += 1;
      console.error(`[kb-folder-sync] cron failed for KB ${row.knowledgeBaseId}:`, error);
    }
  }

  return result;
}
