import { asc, eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunItems,
  appEvalRuns,
  db,
} from '../db/index.ts';
import {
  isTerminalEvalRunItemStage,
  shouldContinueEvalRunDispatch,
  evalRunItemDispatchClaimed,
} from './eval-run-phase.ts';
import { updateEvalRunItem } from './eval-pipeline-jobs.ts';
import { dispatchEvalTranscribeViaAudioPipeline } from './eval-audio-bridge.ts';

import { groupEvalRunDispatchItemsByDatasetFile, type EvalRunDispatchItem } from './eval-run-dispatch-group.ts';

export type { EvalRunDispatchItem } from './eval-run-dispatch-group.ts';
export { groupEvalRunDispatchItemsByDatasetFile } from './eval-run-dispatch-group.ts';

export const EVAL_RUN_WORKER_NO_STATUS_MESSAGE =
  'Worker exited without updating job status (check GitHub Actions logs).';

export const EVAL_RUN_SKIP_NO_PRIOR_SUCCESS_MESSAGE =
  'Skipped — waiting for at least one successful transcription before continuing.';

function itemDispatchClaimed(metrics: unknown): boolean {
  return evalRunItemDispatchClaimed(metrics);
}

export { evalRunItemDispatchClaimed } from './eval-run-phase.ts';

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

export async function abortEvalRunTranscribeWithoutSuccess(runId: string): Promise<void> {
  const { listActiveAttemptItems } = await import('./eval-runs.ts');
  const items = await listActiveAttemptItems(runId);

  for (const item of items) {
    if (isTerminalEvalRunItemStage(item.stage)) continue;

    if (item.stage === 'submitted' && evalRunItemDispatchClaimed(item.metrics)) {
      await updateEvalRunItem(item.id, {
        stage: 'failed',
        errorMessage: item.errorMessage ?? EVAL_RUN_WORKER_NO_STATUS_MESSAGE,
      });
      continue;
    }

    await updateEvalRunItem(item.id, {
      stage: 'cancelled',
      errorMessage: EVAL_RUN_SKIP_NO_PRIOR_SUCCESS_MESSAGE,
    });
  }

  const { maybeFinalizeEvalRunPhase } = await import('./eval-runs.ts');
  await maybeFinalizeEvalRunPhase(runId);
}

/**
 * Dispatch at most one eval pipeline worker, file-by-file and one pipeline job at a time.
 * Stops after the first failure until at least one transcription succeeds.
 */
export async function dispatchNextEvalRunJob(runId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || run.status !== 'running' || run.phase !== 'transcribing') return;

  const { listActiveAttemptItems } = await import('./eval-runs.ts');
  const items = await listActiveAttemptItems(runId);
  if (items.length === 0) return;

  if (!shouldContinueEvalRunDispatch(items)) {
    await abortEvalRunTranscribeWithoutSuccess(runId);
    return;
  }

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
      await dispatchEvalTranscribeViaAudioPipeline(nextItem.id, nextItem.pipelineName);
      console.info(
        `[eval-run] dispatched audio-pipeline job for eval item ${nextItem.id} pipeline=${nextItem.pipelineName} ` +
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
