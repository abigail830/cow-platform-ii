import { asc, eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunItems,
  appEvalRuns,
  db,
} from '../db/index.ts';
import { isTerminalEvalRunItemStage } from './eval-run-phase.ts';
import { updateEvalRunItem } from './eval-pipeline-jobs.ts';
import { spawnAsyncEvalPipelineWorker } from './eval-pipeline-runner.ts';

import { groupEvalRunDispatchItemsByDatasetFile, type EvalRunDispatchItem } from './eval-run-dispatch-group.ts';

export type { EvalRunDispatchItem } from './eval-run-dispatch-group.ts';
export { groupEvalRunDispatchItemsByDatasetFile } from './eval-run-dispatch-group.ts';

function evalRunItemDispatchClaimed(metrics: unknown): boolean {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return false;
  return Boolean((metrics as Record<string, unknown>).dispatch_claimed_at);
}

function itemDispatchClaimed(metrics: unknown): boolean {
  return evalRunItemDispatchClaimed(metrics);
}

export { evalRunItemDispatchClaimed };

function fileItemsInProgress(
  fileItemIds: string[],
  items: Array<typeof appEvalRunItems.$inferSelect>,
): boolean {
  return items.some((item) => {
    if (!fileItemIds.includes(item.id)) return false;
    if (item.stage === 'transcribing') return true;
    if (item.stage === 'submitted' && itemDispatchClaimed(item.metrics)) return true;
    return false;
  });
}

/**
 * Dispatch at most one eval pipeline worker, file-by-file and one pipeline job at a time.
 * Call on run start and whenever a job reaches a terminal stage.
 */
export async function dispatchNextEvalRunJob(runId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || run.status !== 'running' || run.phase !== 'transcribing') return;

  const items = await db.select().from(appEvalRunItems).where(eq(appEvalRunItems.runId, runId));
  if (items.length === 0) return;

  if (items.some((item) => item.stage === 'transcribing')) return;

  const datasetItems = await db
    .select({ id: appEvalDatasetItems.id })
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, run.datasetId))
    .orderBy(asc(appEvalDatasetItems.sortOrder), asc(appEvalDatasetItems.name));

  for (const datasetItem of datasetItems) {
    const fileItems = items.filter((item) => item.datasetItemId === datasetItem.id);
    if (fileItems.length === 0) continue;

    const allTerminal = fileItems.every((item) => isTerminalEvalRunItemStage(item.stage));
    if (allTerminal) continue;

    if (fileItemsInProgress(
      fileItems.map((item) => item.id),
      items,
    )) {
      return;
    }

    const nextItem = fileItems.find(
      (item) => item.stage === 'submitted' && !itemDispatchClaimed(item.metrics),
    );
    if (!nextItem) return;

    await updateEvalRunItem(nextItem.id, {
      metrics: {
        dispatch_claimed_at: new Date().toISOString(),
      },
    });

    try {
      await spawnAsyncEvalPipelineWorker(nextItem.id, nextItem.pipelineName);
      console.info(
        `[eval-run] dispatched job ${nextItem.id} pipeline=${nextItem.pipelineName} ` +
          `dataset_item=${nextItem.datasetItemId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[eval-pipeline] dispatch failed for job ${nextItem.id}: ${message}`);
      await updateEvalRunItem(nextItem.id, {
        stage: 'failed',
        errorMessage: message.slice(0, 2000),
      });
      const { maybeAdvanceEvalRunAfterJobTerminal } = await import('./eval-runs.ts');
      await maybeAdvanceEvalRunAfterJobTerminal(runId);
    }
    return;
  }

  const { maybeFinalizeEvalRunPhase } = await import('./eval-runs.ts');
  await maybeFinalizeEvalRunPhase(runId);
}

export async function orchestrateEvalRunDispatch(runId: string): Promise<void> {
  await dispatchNextEvalRunJob(runId);
}
