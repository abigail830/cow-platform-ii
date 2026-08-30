import { and, asc, desc, eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunAttempts,
  appEvalRunItems,
  appEvalRunJudgeJobs,
  appEvalRunVariants,
  appEvalRuns,
  db,
  type EvalRunJudgeStatus,
  type EvalRunStatus,
} from '../../db/index.ts';
import { buildEvalRunJudgeResultKey } from '../../storage/eval-run-files.ts';
import {
  DEFAULT_EVAL_JUDGE_SCENARIO_ID,
  getEvalJudgeScenario,
} from './eval-judge-dimensions.ts';
import { buildJudgeDimensionsSnapshot } from './eval-run-hotword-judge.ts';
import { buildEvalRunJudgeMetrics } from './eval-run-judge-config.ts';
import { hasEvalDatasetReferenceText } from './eval-datasets.ts';
import { spawnAsyncEvalJudgeWorker } from './eval-judge-runner.ts';

/** Judge runs on GHA; reset stale `running` rows so reconcile can re-dispatch. */
const EVAL_JUDGE_STALE_MS = Number(process.env.EVAL_JUDGE_STALE_MS ?? 45 * 60 * 1000);

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

  let status: EvalRunStatus;
  if (completed === 0) {
    status = 'failed';
  } else if (failed > 0) {
    status = 'completed_with_errors';
  } else {
    status = 'completed';
  }

  return { completed, failed, total: jobs.length, status };
}

/** Dispatch at most one judge worker per attempt (serial, DB-claimed). */
export async function dispatchNextEvalJudgeJob(runId: string): Promise<void> {
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

  const [runningJob] = await db
    .select({ id: appEvalRunJudgeJobs.id })
    .from(appEvalRunJudgeJobs)
    .where(and(eq(appEvalRunJudgeJobs.attemptId, attempt.id), eq(appEvalRunJudgeJobs.status, 'running')))
    .limit(1);
  if (runningJob) return;

  const [nextPending] = await db
    .select()
    .from(appEvalRunJudgeJobs)
    .where(and(eq(appEvalRunJudgeJobs.attemptId, attempt.id), eq(appEvalRunJudgeJobs.status, 'pending')))
    .orderBy(asc(appEvalRunJudgeJobs.createdAt))
    .limit(1);

  if (!nextPending) {
    await maybeFinalizeEvalRunJudgePhase(runId);
    return;
  }

  const [claimed] = await db
    .update(appEvalRunJudgeJobs)
    .set({ status: 'running', errorMessage: null, updatedAt: new Date() })
    .where(and(eq(appEvalRunJudgeJobs.id, nextPending.id), eq(appEvalRunJudgeJobs.status, 'pending')))
    .returning();

  if (!claimed) return;

  try {
    await spawnAsyncEvalJudgeWorker(claimed.id, undefined, { skipMarkRunning: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch eval judge worker';
    console.error(`[eval-run] judge dispatch failed for ${claimed.id}:`, message);
    await db
      .update(appEvalRunJudgeJobs)
      .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
      .where(eq(appEvalRunJudgeJobs.id, claimed.id));
    await syncEvalRunJudgeProgressCounts(runId, attempt.id);
    await dispatchNextEvalJudgeJob(runId);
  }
}

async function syncTranscribeCountsOnRun(runId: string, attemptId: string): Promise<void> {
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
    .set({ completedRunItems, failedRunItems, updatedAt: new Date() })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({ completedRunItems, failedRunItems, updatedAt: new Date() })
    .where(eq(appEvalRunAttempts.id, attemptId));
}

function describeJudgeEligibilityFailure(input: {
  scenario: { label: string; requires_ground_truth: boolean; min_variants: number };
  datasetItems: Array<{ referenceText: string | null }>;
  attemptItems: Array<{ datasetItemId: string; stage: string; transcriptS3Key: string | null }>;
  datasetItemIds: string[];
  pipelineCount: number;
}): string {
  const { scenario, datasetItems, attemptItems, datasetItemIds, pipelineCount } = input;

  if (scenario.requires_ground_truth) {
    const missingRefs = datasetItems.filter((row) => !row.referenceText?.trim()).length;
    if (missingRefs > 0) {
      return `Judge evaluation did not start: ${missingRefs} dataset file(s) are missing ground-truth reference transcripts. Upload references on the dataset page, then run again.`;
    }
  }

  if (pipelineCount < scenario.min_variants) {
    if (scenario.requires_ground_truth) {
      return `Judge evaluation did not start: scenario "${scenario.label}" requires ground-truth references for every file in the dataset.`;
    }
    return `Judge evaluation did not start: scenario "${scenario.label}" requires at least ${scenario.min_variants} pipelines, but this run has ${pipelineCount}. Select another pipeline or upload ground-truth references for single-pipeline scoring.`;
  }

  const withTranscripts = datasetItemIds.filter((datasetItemId) =>
    attemptItems.some(
      (item) =>
        item.datasetItemId === datasetItemId && item.stage === 'done' && item.transcriptS3Key,
    ),
  ).length;

  if (withTranscripts === 0) {
    return 'Judge evaluation did not start: no successful transcripts were found.';
  }

  return 'Judge evaluation did not start: no dataset files met the scenario requirements.';
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

  const [existingJob] = await db
    .select({ id: appEvalRunJudgeJobs.id })
    .from(appEvalRunJudgeJobs)
    .where(eq(appEvalRunJudgeJobs.attemptId, resolvedAttemptId))
    .limit(1);
  if (existingJob) {
    await syncTranscribeCountsOnRun(runId, resolvedAttemptId);
    await db
      .update(appEvalRuns)
      .set({ phase: 'judging', status: 'running', updatedAt: new Date() })
      .where(eq(appEvalRuns.id, runId));
    await db
      .update(appEvalRunAttempts)
      .set({ phase: 'judging', status: 'running', updatedAt: new Date() })
      .where(eq(appEvalRunAttempts.id, resolvedAttemptId));
    return;
  }

  const scenarioId =
    (Array.isArray(run.judgeMetrics) &&
      typeof run.judgeMetrics[0] === 'object' &&
      run.judgeMetrics[0] &&
      typeof (run.judgeMetrics[0] as { scenario_id?: string }).scenario_id === 'string' &&
      (run.judgeMetrics[0] as { scenario_id: string }).scenario_id) ||
    DEFAULT_EVAL_JUDGE_SCENARIO_ID;

  const scenario = await getEvalJudgeScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown eval judge scenario: ${scenarioId}`);

  const [attempt] = await db
    .select()
    .from(appEvalRunAttempts)
    .where(eq(appEvalRunAttempts.id, resolvedAttemptId))
    .limit(1);
  if (!attempt) return;

  const dimensions = await buildJudgeDimensionsSnapshot(scenarioId, attempt);
  const datasetItems = await db
    .select({ id: appEvalDatasetItems.id, referenceText: appEvalDatasetItems.referenceText })
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, run.datasetId))
    .orderBy(asc(appEvalDatasetItems.sortOrder), asc(appEvalDatasetItems.name));

  const attemptItems = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, resolvedAttemptId));

  const variants = await db
    .select({ id: appEvalRunVariants.id })
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));

  const eligibleDatasetItemIds = datasetItems
    .filter((row) => !scenario.requires_ground_truth || hasEvalDatasetReferenceText(row.referenceText))
    .map((row) => row.id)
    .filter((datasetItemId) => {
      const doneCount = attemptItems.filter(
        (item) =>
          item.datasetItemId === datasetItemId && item.stage === 'done' && item.transcriptS3Key,
      ).length;
      return doneCount >= scenario.min_variants;
    });

  await syncTranscribeCountsOnRun(runId, resolvedAttemptId);

  if (eligibleDatasetItemIds.length === 0) {
    const failureMessage = describeJudgeEligibilityFailure({
      scenario,
      datasetItems,
      attemptItems,
      datasetItemIds: datasetItems.map((row) => row.id),
      pipelineCount: variants.length,
    });
    await db
      .update(appEvalRuns)
      .set({
        phase: 'done',
        status: 'failed',
        summaryMetrics: { error: failureMessage },
        updatedAt: new Date(),
      })
      .where(eq(appEvalRuns.id, runId));
    const { syncEvalRunAttemptFromRun } = await import('./eval-run-attempts.ts');
    await syncEvalRunAttemptFromRun(resolvedAttemptId, runId);
    return;
  }

  await db.insert(appEvalRunJudgeJobs).values(
    eligibleDatasetItemIds.map((datasetItemId) => ({
      runId,
      attemptId: resolvedAttemptId,
      datasetItemId,
      scenarioId,
      dimensionsSnapshot: dimensions,
      status: 'pending' as EvalRunJudgeStatus,
    })),
  );

  await db
    .update(appEvalRuns)
    .set({
      phase: 'judging',
      status: 'running',
      totalCompareItems: eligibleDatasetItemIds.length,
      completedCompareItems: 0,
      failedCompareItems: 0,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      phase: 'judging',
      status: 'running',
      totalCompareItems: eligibleDatasetItemIds.length,
      completedCompareItems: 0,
      failedCompareItems: 0,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, resolvedAttemptId));

  // GHA dispatch is resumed on GET detail / reconcile — not fire-and-forget here (Vercel).
}

/** Full-mode runs stuck in legacy inline compare phase → start judge instead. */
export async function migrateEvalRunComparePhaseToJudge(runId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run || run.status !== 'running' || run.phase !== 'comparing' || !run.judgeEnabled) return;

  const attempt = (
    await db
      .select()
      .from(appEvalRunAttempts)
      .where(eq(appEvalRunAttempts.runId, runId))
      .orderBy(desc(appEvalRunAttempts.attemptNumber))
      .limit(1)
  )[0];
  if (!attempt) return;

  await startEvalRunJudgePhase(runId, attempt.id);
}

async function syncEvalRunJudgeProgressCounts(runId: string, attemptId: string): Promise<void> {
  const jobs = await db
    .select()
    .from(appEvalRunJudgeJobs)
    .where(eq(appEvalRunJudgeJobs.attemptId, attemptId));

  let completedCompareItems = 0;
  let failedCompareItems = 0;
  for (const job of jobs) {
    if (job.status === 'done') completedCompareItems += 1;
    else if (job.status === 'failed') failedCompareItems += 1;
  }

  await db
    .update(appEvalRuns)
    .set({
      totalCompareItems: jobs.length,
      completedCompareItems,
      failedCompareItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      totalCompareItems: jobs.length,
      completedCompareItems,
      failedCompareItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, attemptId));
}

export async function reconcileAndResumeEvalRunJudgePhase(runId: string): Promise<void> {
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

  const now = Date.now();
  const pendingIds: string[] = [];
  for (const job of jobs) {
    if (job.status === 'pending') {
      pendingIds.push(job.id);
      continue;
    }
    if (job.status === 'running' && now - job.updatedAt.getTime() > EVAL_JUDGE_STALE_MS) {
      await db
        .update(appEvalRunJudgeJobs)
        .set({ status: 'pending', errorMessage: null, updatedAt: new Date() })
        .where(eq(appEvalRunJudgeJobs.id, job.id));
      pendingIds.push(job.id);
    }
  }

  await syncEvalRunJudgeProgressCounts(runId, attempt.id);

  if (pendingIds.length === 0) {
    await maybeFinalizeEvalRunJudgePhase(runId);
    return;
  }

  await dispatchNextEvalJudgeJob(runId);
}

export async function retryEvalRunJudgeJob(
  runId: string,
  datasetItemId: string,
  attemptId?: string,
): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run) throw new Error('Eval run not found');
  if (!run.judgeEnabled) throw new Error('Judge compare is not enabled for this run');
  if (run.runMode !== 'full') throw new Error('Compare retry is only available for full eval runs');

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
  if (!resolvedAttemptId) throw new Error('Eval run attempt not found');

  const [job] = await db
    .select()
    .from(appEvalRunJudgeJobs)
    .where(
      and(
        eq(appEvalRunJudgeJobs.attemptId, resolvedAttemptId),
        eq(appEvalRunJudgeJobs.datasetItemId, datasetItemId),
      ),
    )
    .limit(1);
  if (!job) throw new Error('Compare job not found for this file');

  const scenario = await getEvalJudgeScenario(job.scenarioId);
  if (!scenario) throw new Error(`Unknown eval judge scenario: ${job.scenarioId}`);

  const attemptItems = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, resolvedAttemptId));
  const doneCount = attemptItems.filter(
    (item) =>
      item.datasetItemId === datasetItemId && item.stage === 'done' && item.transcriptS3Key,
  ).length;
  if (doneCount < scenario.min_variants) {
    throw new Error(
      `At least ${scenario.min_variants} successful transcript(s) are required before compare can run`,
    );
  }

  if (job.status === 'running') {
    throw new Error('Compare is already running for this file');
  }

  const [attempt] = await db
    .select()
    .from(appEvalRunAttempts)
    .where(eq(appEvalRunAttempts.id, resolvedAttemptId))
    .limit(1);
  if (!attempt) throw new Error('Eval run attempt not found');

  const dimensions = await buildJudgeDimensionsSnapshot(job.scenarioId, attempt);

  await db
    .update(appEvalRunJudgeJobs)
    .set({
      status: 'pending',
      errorMessage: null,
      summaryMetrics: null,
      resultS3Key: null,
      dimensionsSnapshot: dimensions,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunJudgeJobs.id, job.id));

  await db
    .update(appEvalRuns)
    .set({
      status: 'running',
      phase: 'judging',
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      status: 'running',
      phase: 'judging',
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, resolvedAttemptId));

  await syncEvalRunJudgeProgressCounts(runId, resolvedAttemptId);
  await spawnAsyncEvalJudgeWorker(job.id);
}

/** Re-run judge evaluation for an attempt that already has transcripts (no re-transcribe). */
export async function evaluateEvalRunAttempt(runId: string, attemptId: string): Promise<void> {
  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (!run) throw new Error('Eval run not found');

  if (run.status === 'running') {
    throw new Error('This evaluation run is still in progress');
  }

  const [attempt] = await db
    .select()
    .from(appEvalRunAttempts)
    .where(and(eq(appEvalRunAttempts.id, attemptId), eq(appEvalRunAttempts.runId, runId)))
    .limit(1);
  if (!attempt) throw new Error('Eval run attempt not found');
  if (attempt.status === 'running') {
    throw new Error('This run attempt is still in progress');
  }
  if (attempt.runMode !== 'full') {
    throw new Error('Evaluate is only available for full eval runs');
  }

  const attemptItems = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, attemptId));

  const inFlight = attemptItems.some(
    (item) => item.stage === 'submitted' || item.stage === 'transcribing',
  );
  if (inFlight) {
    throw new Error('Wait for transcription to finish before running evaluate');
  }

  const doneWithTranscript = attemptItems.filter(
    (item) => item.stage === 'done' && item.transcriptS3Key,
  ).length;
  if (doneWithTranscript === 0) {
    throw new Error('No successful transcripts to evaluate');
  }

  const variants = await db
    .select({ id: appEvalRunVariants.id })
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));

  const judgeMetrics = await buildEvalRunJudgeMetrics({
    datasetId: run.datasetId,
    pipelineCount: variants.length,
  });

  await db
    .update(appEvalRuns)
    .set({
      runMode: 'full',
      judgeEnabled: true,
      judgeMetrics,
      summaryMetrics: null,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db.delete(appEvalRunJudgeJobs).where(eq(appEvalRunJudgeJobs.attemptId, attemptId));

  await startEvalRunJudgePhase(runId, attemptId);

  const [runAfter] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, runId)).limit(1);
  if (runAfter?.status === 'failed' && runAfter.phase === 'done') {
    const error =
      runAfter.summaryMetrics &&
      typeof runAfter.summaryMetrics === 'object' &&
      !Array.isArray(runAfter.summaryMetrics) &&
      typeof (runAfter.summaryMetrics as { error?: unknown }).error === 'string'
        ? (runAfter.summaryMetrics as { error: string }).error
        : 'Judge evaluation could not start for this attempt';
    throw new Error(error);
  }

  await reconcileAndResumeEvalRunJudgePhase(runId);
}

export async function finalizeEvalJudgeJobFromWorker(input: {
  jobId: string;
  status: EvalRunJudgeStatus;
  summaryMetrics?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const job = (
    await db.select().from(appEvalRunJudgeJobs).where(eq(appEvalRunJudgeJobs.id, input.jobId)).limit(1)
  )[0];
  if (!job) throw new Error('Eval judge job not found');

  // Worker uploads result JSON to OSS (artifact_keys.result); backend only records the key.
  const resultS3Key =
    input.status === 'done'
      ? buildEvalRunJudgeResultKey(job.runId, job.attemptId, job.datasetItemId)
      : job.resultS3Key;

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

  await syncEvalRunJudgeProgressCounts(job.runId, job.attemptId);
  await maybeFinalizeEvalRunJudgePhase(job.runId);
  await dispatchNextEvalJudgeJob(job.runId);
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

  const [runRow] = await db
    .select({ summaryMetrics: appEvalRuns.summaryMetrics })
    .from(appEvalRuns)
    .where(eq(appEvalRuns.id, runId))
    .limit(1);
  const priorTranscribe =
    runRow?.summaryMetrics &&
    typeof runRow.summaryMetrics === 'object' &&
    !Array.isArray(runRow.summaryMetrics)
      ? (runRow.summaryMetrics as Record<string, unknown>).transcribe
      : undefined;

  const summaryMetrics = {
    ...aggregateJudgeSummaryMetrics(jobs),
    ...(priorTranscribe !== undefined ? { transcribe: priorTranscribe } : {}),
  };

  const attemptItems = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, attempt.id));
  const transcribeSucceeded = attemptItems.some((item) => item.stage === 'done');

  let runStatus = completion.status;
  if (runStatus === 'failed' && transcribeSucceeded && completion.completed + completion.failed > 0) {
    runStatus = 'completed_with_errors';
  }

  await db
    .update(appEvalRuns)
    .set({
      status: runStatus,
      phase: 'done',
      summaryMetrics,
      completedCompareItems: completion.completed,
      failedCompareItems: completion.failed,
      totalCompareItems: completion.total,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  const { syncEvalRunAttemptFromRun } = await import('./eval-run-attempts.ts');
  await syncEvalRunAttemptFromRun(attempt.id, runId);

  const variantStatus = runStatus === 'failed' ? 'failed' : 'done';
  await db
    .update(appEvalRunVariants)
    .set({ status: variantStatus, updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));
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
