import { asc, desc, eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunAttempts,
  appEvalRunComparisons,
  appEvalRunItems,
  appEvalRunVariants,
  appEvalRuns,
  db,
  type EvalRunCompareStatus,
} from '../../db/index.ts';
import { readStorageText } from '../../storage/document-content.ts';
import { uploadAudioObject } from '../../storage/audio-files.ts';
import { buildEvalRunComparisonKey } from '../../storage/eval-run-files.ts';
import { computeEvalRunCompareCompletion } from './eval-run-phase.ts';

export const EVAL_RUN_DEFAULT_COMPARE_CONCURRENCY = 3;

/** Compare runs inline on the backend (not GHA). Stale `running` rows are reset on detail reads. */
const EVAL_COMPARE_STALE_MS = Number(process.env.EVAL_COMPARE_STALE_MS ?? 5 * 60 * 1000);

const EVAL_COMPARE_RESUME_BATCH = Number(process.env.EVAL_COMPARE_RESUME_BATCH ?? 3);

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export async function runEvalRunCompare(comparisonId: string): Promise<void> {
  const [comparison] = await db
    .select()
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.id, comparisonId))
    .limit(1);
  if (!comparison) throw new Error('Eval run comparison not found');
  if (comparison.status === 'done' || comparison.status === 'failed') return;

  await db
    .update(appEvalRunComparisons)
    .set({ status: 'running', errorMessage: null, updatedAt: new Date() })
    .where(eq(appEvalRunComparisons.id, comparisonId));

  try {
    const items = await db
      .select()
      .from(appEvalRunItems)
      .where(eq(appEvalRunItems.attemptId, comparison.attemptId));

    const targetItems = items.filter((item) => item.datasetItemId === comparison.datasetItemId);
    const variants = await db
      .select()
      .from(appEvalRunVariants)
      .where(eq(appEvalRunVariants.runId, comparison.runId));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    const doneItems = targetItems.filter((item) => item.stage === 'done' && item.transcriptS3Key);
    if (doneItems.length < 2) {
      throw new Error('At least two successful transcripts are required to compare pipelines');
    }

    const entries = [];
    for (const item of doneItems) {
      const variant = variantById.get(item.variantId);
      if (!variant) continue;
      const transcript = item.transcriptS3Key ? await readStorageText(item.transcriptS3Key) : null;
      if (transcript == null) {
        throw new Error(`Transcript missing for ${variant.displayName}`);
      }
      entries.push({
        variant_id: variant.id,
        pipeline_name: variant.pipelineName,
        display_name: variant.displayName,
        word_count: wordCount(transcript),
        char_count: transcript.length,
        transcript_preview: transcript.slice(0, 500),
      });
    }

    const resultKey = buildEvalRunComparisonKey(
      comparison.runId,
      comparison.attemptId,
      comparison.datasetItemId,
    );
    const payload = {
      run_id: comparison.runId,
      attempt_id: comparison.attemptId,
      dataset_item_id: comparison.datasetItemId,
      compared_at: new Date().toISOString(),
      variants: entries,
    };
    await uploadAudioObject(resultKey, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), 'application/json');

    await db
      .update(appEvalRunComparisons)
      .set({
        status: 'done',
        resultS3Key: resultKey,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(appEvalRunComparisons.id, comparisonId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compare failed';
    await db
      .update(appEvalRunComparisons)
      .set({
        status: 'failed',
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(appEvalRunComparisons.id, comparisonId));
  }

  await syncEvalRunCompareProgressCounts(comparison.runId, comparison.attemptId);
  await maybeFinalizeEvalRunComparePhase(comparison.runId);
}

async function syncEvalRunCompareProgressCounts(runId: string, attemptId: string): Promise<void> {
  const comparisons = await db
    .select()
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.attemptId, attemptId));

  let completedCompareItems = 0;
  let failedCompareItems = 0;
  for (const row of comparisons) {
    if (row.status === 'done') completedCompareItems += 1;
    else if (row.status === 'failed') failedCompareItems += 1;
  }

  const items = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, attemptId));
  let completedRunItems = 0;
  let failedRunItems = 0;
  for (const item of items) {
    if (item.stage === 'done') completedRunItems += 1;
    else if (item.stage === 'failed' || item.stage === 'cancelled') failedRunItems += 1;
  }

  await db
    .update(appEvalRuns)
    .set({
      completedCompareItems,
      failedCompareItems,
      completedRunItems,
      failedRunItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      completedCompareItems,
      failedCompareItems,
      completedRunItems,
      failedRunItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, attemptId));
}

export async function reconcileAndResumeEvalRunComparePhase(runId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || run.status !== 'running' || run.phase !== 'comparing') return;

  const attempt = (
    await db
      .select()
      .from(appEvalRunAttempts)
      .where(eq(appEvalRunAttempts.runId, runId))
      .orderBy(desc(appEvalRunAttempts.attemptNumber))
      .limit(1)
  )[0];
  if (!attempt) return;

  const comparisons = await db
    .select()
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.attemptId, attempt.id));

  const now = Date.now();
  const pendingIds: string[] = [];
  for (const row of comparisons) {
    if (row.status === 'pending') {
      pendingIds.push(row.id);
      continue;
    }
    if (row.status === 'running' && now - row.updatedAt.getTime() > EVAL_COMPARE_STALE_MS) {
      await db
        .update(appEvalRunComparisons)
        .set({ status: 'pending', errorMessage: null, updatedAt: new Date() })
        .where(eq(appEvalRunComparisons.id, row.id));
      pendingIds.push(row.id);
    }
  }

  await syncEvalRunCompareProgressCounts(runId, attempt.id);

  if (pendingIds.length === 0) {
    await maybeFinalizeEvalRunComparePhase(runId);
    return;
  }

  const batch = pendingIds.slice(0, Math.max(1, EVAL_COMPARE_RESUME_BATCH));
  await dispatchEvalRunComparisonsWithConcurrency(batch, 1);
  await maybeFinalizeEvalRunComparePhase(runId);
}

export async function dispatchEvalRunComparisonsWithConcurrency(
  comparisonIds: string[],
  concurrency = EVAL_RUN_DEFAULT_COMPARE_CONCURRENCY,
): Promise<void> {
  const limit = Math.max(1, concurrency);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < comparisonIds.length) {
      const current = comparisonIds[index];
      index += 1;
      try {
        await runEvalRunCompare(current);
      } catch (error) {
        console.error(
          `[eval-run] compare failed for ${current}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, comparisonIds.length) }, () => worker());
  await Promise.all(workers);
}

export async function startEvalRunComparePhase(
  runId: string,
  attemptId?: string,
): Promise<void> {
  const run = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  const row = run[0];
  if (!row || row.runMode !== 'full') return;

  const resolvedAttemptId =
    attemptId?.trim() ||
    (
      await db
        .select({ id: appEvalRunAttempts.id })
        .from(appEvalRunAttempts)
        .where(eq(appEvalRunAttempts.runId, runId))
        .orderBy(desc(appEvalRunAttempts.attemptNumber))
        .limit(1)
    )[0]?.id;
  if (!resolvedAttemptId) return;

  const [existingComparison] = await db
    .select({ id: appEvalRunComparisons.id })
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.attemptId, resolvedAttemptId))
    .limit(1);
  if (existingComparison) return;

  const datasetItems = await db
    .select({ id: appEvalDatasetItems.id })
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, row.datasetId))
    .orderBy(asc(appEvalDatasetItems.sortOrder), asc(appEvalDatasetItems.name));

  if (datasetItems.length === 0) return;

  const comparisonRows = await db
    .insert(appEvalRunComparisons)
    .values(
      datasetItems.map((item) => ({
        runId,
        attemptId: resolvedAttemptId,
        datasetItemId: item.id,
        status: 'pending' as EvalRunCompareStatus,
      })),
    )
    .returning();

  const attemptItems = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, resolvedAttemptId));
  let completedRunItems = 0;
  let failedRunItems = 0;
  for (const item of attemptItems) {
    if (item.stage === 'done') completedRunItems += 1;
    else if (item.stage === 'failed' || item.stage === 'cancelled') failedRunItems += 1;
  }

  await db
    .update(appEvalRuns)
    .set({
      phase: 'comparing',
      status: 'running',
      totalCompareItems: comparisonRows.length,
      completedCompareItems: 0,
      failedCompareItems: 0,
      completedRunItems,
      failedRunItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      phase: 'comparing',
      status: 'running',
      totalCompareItems: comparisonRows.length,
      completedCompareItems: 0,
      failedCompareItems: 0,
      completedRunItems,
      failedRunItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, resolvedAttemptId));

  // Compare work is resumed on GET detail / reconcile — not fire-and-forget here (Vercel kills the process).
}

export async function maybeFinalizeEvalRunComparePhase(runId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || run.status !== 'running' || run.phase !== 'comparing') return;

  const attempt = (
    await db
      .select()
      .from(appEvalRunAttempts)
      .where(eq(appEvalRunAttempts.runId, runId))
      .orderBy(desc(appEvalRunAttempts.attemptNumber))
      .limit(1)
  )[0];
  if (!attempt) return;

  const comparisons = await db
    .select()
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.attemptId, attempt.id));

  const completion = computeEvalRunCompareCompletion(comparisons);
  if (!completion) return;

  const items = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, attempt.id));
  let completedRunItems = 0;
  let failedRunItems = 0;
  for (const item of items) {
    if (item.stage === 'done') completedRunItems += 1;
    else if (item.stage === 'failed' || item.stage === 'cancelled') failedRunItems += 1;
  }

  if (run.judgeEnabled) {
    await db
      .update(appEvalRuns)
      .set({
        status: 'running',
        completedCompareItems: completion.completedCompareItems,
        failedCompareItems: completion.failedCompareItems,
        completedRunItems,
        failedRunItems,
        updatedAt: new Date(),
      })
      .where(eq(appEvalRuns.id, runId));

    const { syncEvalRunAttemptFromRun } = await import('./eval-run-attempts.ts');
    await syncEvalRunAttemptFromRun(attempt.id, runId);

    const { startEvalRunJudgePhase } = await import('./eval-run-judge.ts');
    await startEvalRunJudgePhase(runId, attempt.id);
    return;
  }

  await db
    .update(appEvalRuns)
    .set({
      status: completion.status,
      phase: 'done',
      completedCompareItems: completion.completedCompareItems,
      failedCompareItems: completion.failedCompareItems,
      completedRunItems,
      failedRunItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  const { syncEvalRunAttemptFromRun } = await import('./eval-run-attempts.ts');
  await syncEvalRunAttemptFromRun(attempt.id, runId);

  const variantStatus = completion.status === 'failed' ? 'failed' : 'done';
  await db
    .update(appEvalRunVariants)
    .set({ status: variantStatus, updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));
}
