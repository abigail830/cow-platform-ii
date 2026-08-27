import { asc, desc, eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunAttempts,
  appEvalRunItems,
  appEvalRunJudgeJobs,
  appEvalRuns,
  db,
  type EvalRunJudgeStatus,
} from '../db/index.ts';
import { uploadAudioObject } from '../storage/audio-files.ts';
import { buildEvalRunJudgeResultKey } from '../storage/eval-run-files.ts';
import {
  DEFAULT_EVAL_JUDGE_SCENARIO_ID,
  getEvalJudgeScenario,
  snapshotEvalJudgeDimensions,
} from './eval-judge-dimensions.ts';
import { spawnAsyncEvalJudgeWorker } from './eval-judge-runner.ts';

export const EVAL_RUN_DEFAULT_JUDGE_CONCURRENCY = 2;

function isTerminalJudgeStatus(status: string): boolean {
  return status === 'done' || status === 'failed';
}

function computeJudgeCompletion(jobs: Array<{ status: string }>) {
  if (jobs.length === 0) return null;
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    if (job.status === 'done') completed += 1;
    else if (job.status === 'failed') failed += 1;
    else if (!isTerminalJudgeStatus(job.status)) return null;
  }
  const status = failed > 0 && completed === 0 ? 'failed' : 'completed';
  return { completed, failed, status: status as 'completed' | 'failed' };
}

export async function dispatchEvalRunJudgeJobsWithConcurrency(
  jobIds: string[],
  concurrency = EVAL_RUN_DEFAULT_JUDGE_CONCURRENCY,
): Promise<void> {
  const limit = Math.max(1, concurrency);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < jobIds.length) {
      const current = jobIds[index];
      index += 1;
      try {
        await spawnAsyncEvalJudgeWorker(current);
      } catch (error) {
        console.error(
          `[eval-run] judge dispatch failed for ${current}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, jobIds.length) }, () => worker());
  await Promise.all(workers);
}

export async function startEvalRunJudgePhase(
  runId: string,
  attemptId?: string,
): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || !run.judgeEnabled) return;

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

  const scenarioId =
    (Array.isArray(run.judgeMetrics) &&
      typeof run.judgeMetrics[0] === 'object' &&
      run.judgeMetrics[0] &&
      typeof (run.judgeMetrics[0] as { scenario_id?: string }).scenario_id === 'string' &&
      (run.judgeMetrics[0] as { scenario_id: string }).scenario_id) ||
    DEFAULT_EVAL_JUDGE_SCENARIO_ID;

  const scenario = getEvalJudgeScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown eval judge scenario: ${scenarioId}`);

  const dimensions = snapshotEvalJudgeDimensions(scenarioId);
  const datasetItems = await db
    .select({ id: appEvalDatasetItems.id })
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, run.datasetId))
    .orderBy(asc(appEvalDatasetItems.sortOrder), asc(appEvalDatasetItems.name));

  const attemptItems = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, resolvedAttemptId));

  const eligibleDatasetItemIds = datasetItems
    .map((row) => row.id)
    .filter((datasetItemId) => {
      const doneCount = attemptItems.filter(
        (item) =>
          item.datasetItemId === datasetItemId && item.stage === 'done' && item.transcriptS3Key,
      ).length;
      return doneCount >= scenario.min_variants;
    });

  if (eligibleDatasetItemIds.length === 0) {
    await db
      .update(appEvalRuns)
      .set({ phase: 'done', status: 'completed', updatedAt: new Date() })
      .where(eq(appEvalRuns.id, runId));
    return;
  }

  const judgeRows = await db
    .insert(appEvalRunJudgeJobs)
    .values(
      eligibleDatasetItemIds.map((datasetItemId) => ({
        runId,
        attemptId: resolvedAttemptId,
        datasetItemId,
        scenarioId,
        dimensionsSnapshot: dimensions,
        status: 'pending' as EvalRunJudgeStatus,
      })),
    )
    .returning();

  await db
    .update(appEvalRuns)
    .set({
      phase: 'judging',
      status: 'running',
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      phase: 'judging',
      status: 'running',
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, resolvedAttemptId));

  void dispatchEvalRunJudgeJobsWithConcurrency(judgeRows.map((row) => row.id));
}

export async function finalizeEvalJudgeJobFromWorker(input: {
  jobId: string;
  status: EvalRunJudgeStatus;
  result?: Record<string, unknown> | null;
  summaryMetrics?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const job = (
    await db.select().from(appEvalRunJudgeJobs).where(eq(appEvalRunJudgeJobs.id, input.jobId)).limit(1)
  )[0];
  if (!job) throw new Error('Eval judge job not found');

  let resultS3Key: string | null = job.resultS3Key;
  if (input.status === 'done' && input.result) {
    resultS3Key = buildEvalRunJudgeResultKey(job.runId, job.attemptId, job.datasetItemId);
    await uploadAudioObject(
      resultS3Key,
      Buffer.from(JSON.stringify(input.result, null, 2), 'utf8'),
      'application/json',
    );
  }

  await db
    .update(appEvalRunJudgeJobs)
    .set({
      status: input.status,
      resultS3Key,
      summaryMetrics: input.summaryMetrics ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunJudgeJobs.id, input.jobId));

  await maybeFinalizeEvalRunJudgePhase(job.runId);
}

export async function maybeFinalizeEvalRunJudgePhase(runId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || run.status !== 'running' || run.phase !== 'judging') return;

  const attempt = (
    await db
      .select()
      .from(appEvalRunAttempts)
      .where(eq(appEvalRunAttempts.runId, runId))
      .orderBy(desc(appEvalRunAttempts.attemptNumber))
      .limit(1)
  )[0];
  if (!attempt) return;

  const jobs = await db
    .select()
    .from(appEvalRunJudgeJobs)
    .where(eq(appEvalRunJudgeJobs.attemptId, attempt.id));

  const completion = computeJudgeCompletion(jobs);
  if (!completion) return;

  const summaryMetrics = aggregateJudgeSummaryMetrics(jobs);

  await db
    .update(appEvalRuns)
    .set({
      status: completion.status,
      phase: 'done',
      summaryMetrics,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  const { syncEvalRunAttemptFromRun } = await import('./eval-run-attempts.ts');
  await syncEvalRunAttemptFromRun(attempt.id, runId);
}

function aggregateJudgeSummaryMetrics(
  jobs: Array<{ summaryMetrics: Record<string, unknown> | null; status: string }>,
): Record<string, unknown> {
  const doneJobs = jobs.filter((job) => job.status === 'done' && job.summaryMetrics);
  if (doneJobs.length === 0) {
    return {
      judge_jobs_total: jobs.length,
      judge_jobs_done: jobs.filter((job) => job.status === 'done').length,
      judge_jobs_failed: jobs.filter((job) => job.status === 'failed').length,
    };
  }

  return {
    judge_jobs_total: jobs.length,
    judge_jobs_done: doneJobs.length,
    judge_jobs_failed: jobs.filter((job) => job.status === 'failed').length,
    dimensions: doneJobs.map((job) => job.summaryMetrics),
  };
}
