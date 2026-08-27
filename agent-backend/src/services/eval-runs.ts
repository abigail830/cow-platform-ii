import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunComparisons,
  appEvalRunJudgeJobs,
  appEvalRunItems,
  appEvalRunAttempts,
  appEvalRunVariants,
  appEvalRuns,
  db,
  type EvalRunItemStage,
  type EvalRunMode,
  type EvalRunStatus,
} from '../db/index.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { getEvalDatasetById, createEvalDataset, deleteEvalDataset, listEvalDatasetItems } from './eval-datasets.ts';
import { computeEvalRunCompletion, isTerminalEvalRunItemStage, evalRunItemDispatchClaimed } from './eval-run-phase.ts';
import { evalRunItemToPublic, snapshotConfigYaml } from './eval-pipeline-jobs.ts';
import { orchestrateEvalRunDispatch } from './eval-run-dispatch.ts';
import { buildEvalRunItemOutputPrefix } from '../storage/eval-run-files.ts';
import { isAudioAsyncPipelineName, audioPipelineProviderForName } from './audio-pipeline-names.ts';
import { getStorageReadUrl } from '../storage/document-files.ts';
import { shouldFailStaleAudioJob } from './audio-pipeline-stale.ts';
import { startEvalRunComparePhase } from './eval-run-compare.ts';
import {
  migrateEvalRunComparePhaseToJudge,
  startEvalRunJudgePhase,
} from './eval-run-judge.ts';
import {
  createEvalRunAttempt,
  getLatestEvalRunAttempt,
  listEvalRunAttempts,
  syncEvalRunAttemptFromRun,
  toAttemptPublic,
} from './eval-run-attempts.ts';
import { enrichEvalRunItemPublic } from './eval-run-item-enrichment.ts';
import {
  DEFAULT_EVAL_JUDGE_SCENARIO_ID,
  snapshotEvalJudgeDimensions,
} from './eval-judge-dimensions.ts';
import { resolveEvalJudgeConfigYaml } from '../shared/eval-judge-workflow.ts';

const EVAL_RUN_WORKER_NO_STATUS_MESSAGE =
  'Worker exited without updating job status (check GitHub Actions logs).';

const EVAL_DISPATCH_CLAIM_STALE_MS = Number(
  process.env.EVAL_PIPELINE_DISPATCH_CLAIM_STALE_MS ?? 2 * 60 * 1000,
);

function dispatchClaimedAt(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const raw = (metrics as Record<string, unknown>).dispatch_claimed_at;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function shouldFailStaleEvalRunItem(
  item: typeof appEvalRunItems.$inferSelect,
  now = Date.now(),
): { stale: boolean; message?: string } {
  if (item.stage === 'submitted' && evalRunItemDispatchClaimed(item.metrics)) {
    const claimedAt = dispatchClaimedAt(item.metrics);
    if (claimedAt != null && now - claimedAt > EVAL_DISPATCH_CLAIM_STALE_MS) {
      return {
        stale: true,
        message: item.errorMessage ?? EVAL_RUN_WORKER_NO_STATUS_MESSAGE,
      };
    }
  }

  if (item.audioPipelineJobId) {
    return { stale: false };
  }

  return shouldFailStaleAudioJob({
    stage: item.stage,
    externalJobId: item.externalJobId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    now,
  });
}

function toRunPublic(row: typeof appEvalRuns.$inferSelect) {
  return {
    id: row.id,
    dataset_id: row.datasetId,
    name: row.name,
    description: row.description,
    status: row.status,
    phase: row.phase,
    run_mode: row.runMode,
    eval_type: row.evalType,
    judge_enabled: row.judgeEnabled,
    total_run_items: row.totalRunItems,
    completed_run_items: row.completedRunItems,
    failed_run_items: row.failedRunItems,
    total_compare_items: row.totalCompareItems,
    completed_compare_items: row.completedCompareItems,
    failed_compare_items: row.failedCompareItems,
    summary_metrics: row.summaryMetrics,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toVariantPublic(row: typeof appEvalRunVariants.$inferSelect) {
  return {
    id: row.id,
    run_id: row.runId,
    pipeline_config_id: row.pipelineConfigId,
    pipeline_name: row.pipelineName,
    display_name: row.displayName,
    status: row.status,
  };
}

export async function listEvalRuns() {
  const rows = await db.select().from(appEvalRuns).orderBy(desc(appEvalRuns.updatedAt));
  if (rows.length === 0) return [];

  const runIds = rows.map((row) => row.id);
  const datasetIds = [...new Set(rows.map((row) => row.datasetId))];

  const itemCounts =
    datasetIds.length === 0
      ? []
      : await db
          .select({
            datasetId: appEvalDatasetItems.datasetId,
            count: sql<number>`count(*)::int`,
          })
          .from(appEvalDatasetItems)
          .where(inArray(appEvalDatasetItems.datasetId, datasetIds))
          .groupBy(appEvalDatasetItems.datasetId);

  const attempts = await db
    .select({
      runId: appEvalRunAttempts.runId,
      startedAt: appEvalRunAttempts.startedAt,
      attemptNumber: appEvalRunAttempts.attemptNumber,
    })
    .from(appEvalRunAttempts)
    .where(inArray(appEvalRunAttempts.runId, runIds))
    .orderBy(desc(appEvalRunAttempts.attemptNumber));

  const fileCountByDatasetId = new Map(itemCounts.map((row) => [row.datasetId, row.count]));
  const lastRunAtByRunId = new Map<string, string>();
  for (const attempt of attempts) {
    if (lastRunAtByRunId.has(attempt.runId)) continue;
    lastRunAtByRunId.set(attempt.runId, attempt.startedAt.toISOString());
  }

  return rows.map((row) => ({
    ...toRunPublic(row),
    file_count: fileCountByDatasetId.get(row.datasetId) ?? 0,
    last_run_at: lastRunAtByRunId.get(row.id) ?? null,
  }));
}

export async function getEvalRunById(id: string) {
  const [row] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, id)).limit(1);
  return row ?? null;
}

export async function createEvalRun(input: {
  datasetId?: string | null;
  name: string;
  description?: string | null;
  pipelineConfigIds: string[];
  runMode?: EvalRunMode;
  createdBy?: string | null;
}) {
  const name = input.name.trim();
  if (!name || name.length > 256) throw new Error('Run name must be 1–256 characters');

  const pipelineConfigIds = [...new Set(input.pipelineConfigIds.map((id) => id.trim()).filter(Boolean))];
  if (pipelineConfigIds.length === 0) {
    throw new Error('At least one pipeline is required');
  }

  let datasetId = input.datasetId?.trim() || '';
  if (datasetId) {
    const dataset = await getEvalDatasetById(datasetId);
    if (!dataset) throw new Error('Dataset not found');
    if (dataset.mediaType !== 'audio') {
      throw new Error('Only audio datasets are supported in this version');
    }
  } else {
    const dataset = await createEvalDataset({
      name,
      description: input.description?.trim() || null,
      createdBy: input.createdBy ?? null,
    });
    datasetId = dataset.id;
  }

  const variants: Array<{
    pipelineConfigId: string;
    pipelineName: string;
    displayName: string;
    configYaml: string | null;
  }> = [];

  for (const pipelineConfigId of pipelineConfigIds) {
    const pipeline = await getPipelineConfigById(pipelineConfigId);
    if (!pipeline) throw new Error(`Pipeline not found: ${pipelineConfigId}`);
    if (!pipeline.isEnabled) throw new Error(`Pipeline is disabled: ${pipeline.name}`);
    if (!isAudioAsyncPipelineName(pipeline.pipelineName)) {
      throw new Error(`Pipeline must be an async audio transcribe pipeline: ${pipeline.pipelineName}`);
    }
    if (!audioPipelineProviderForName(pipeline.pipelineName)) {
      throw new Error(`Unsupported async audio pipeline: ${pipeline.pipelineName}`);
    }
    variants.push({
      pipelineConfigId: pipeline.id,
      pipelineName: pipeline.pipelineName,
      displayName: pipeline.name,
      configYaml: pipeline.configYaml,
    });
  }

  const runMode = input.runMode === 'full' ? 'full' : 'pipeline_only';
  const judgeConfigYaml = runMode === 'full' ? await resolveEvalJudgeConfigYaml() : null;

  const [run] = await db
    .insert(appEvalRuns)
    .values({
      datasetId,
      name,
      description: input.description?.trim() || null,
      status: 'draft',
      phase: 'transcribing',
      runMode,
      judgeEnabled: runMode === 'full',
      judgeMetrics:
        runMode === 'full'
          ? [
              {
                scenario_id: DEFAULT_EVAL_JUDGE_SCENARIO_ID,
                dimensions: snapshotEvalJudgeDimensions(),
                config_yaml: judgeConfigYaml,
              },
            ]
          : null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  const variantRows = await db
    .insert(appEvalRunVariants)
    .values(
      variants.map((variant) => ({
        runId: run!.id,
        pipelineConfigId: variant.pipelineConfigId,
        pipelineName: variant.pipelineName,
        displayName: variant.displayName,
        configYaml: variant.configYaml,
        status: 'pending',
      })),
    )
    .returning();

  return {
    run: toRunPublic(run!),
    variants: variantRows.map(toVariantPublic),
  };
}

export async function listActiveAttemptItems(runId: string) {
  const attempt = await getLatestEvalRunAttempt(runId);
  if (!attempt) return [];
  return db.select().from(appEvalRunItems).where(eq(appEvalRunItems.attemptId, attempt.id));
}

export async function startEvalRun(runId: string, options?: { runMode?: EvalRunMode }) {
  let run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');

  if (run.status === 'running') {
    await reconcileStaleEvalRunItems(runId);
    run = (await getEvalRunById(runId))!;
  }
  if (run.status === 'running') {
    throw new Error(
      'This evaluation run is still in progress. Wait for it to finish, then try Restart again.',
    );
  }
  if (run.status !== 'draft') {
    const latest = await getLatestEvalRunAttempt(runId);
    if (latest && latest.status === 'running') {
      throw new Error(
        'This evaluation run is still in progress. Wait for it to finish, then try Restart again.',
      );
    }
  }

  const runMode = options?.runMode
    ? options.runMode === 'full'
      ? 'full'
      : 'pipeline_only'
    : run.runMode;

  if (options?.runMode) {
    await db
      .update(appEvalRuns)
      .set({
        runMode,
        judgeEnabled: runMode === 'full',
        judgeMetrics:
          runMode === 'full'
            ? [
                {
                  scenario_id: DEFAULT_EVAL_JUDGE_SCENARIO_ID,
                  dimensions: snapshotEvalJudgeDimensions(),
                  config_yaml: await resolveEvalJudgeConfigYaml(),
                },
              ]
            : null,
        updatedAt: new Date(),
      })
      .where(eq(appEvalRuns.id, runId));
    run = (await getEvalRunById(runId))!;
  }

  const attempt = await createEvalRunAttempt({ runId, runMode });

  const variants = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));

  const datasetItems = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, run.datasetId))
    .orderBy(asc(appEvalDatasetItems.sortOrder), asc(appEvalDatasetItems.name));

  if (datasetItems.length === 0) throw new Error('Dataset has no files');

  const itemRows: Array<typeof appEvalRunItems.$inferSelect> = [];
  for (const variant of variants) {
    for (const datasetItem of datasetItems) {
      const outputS3Prefix = buildEvalRunItemOutputPrefix(
        runId,
        attempt.id,
        variant.id,
        datasetItem.id,
      );
      const [row] = await db
        .insert(appEvalRunItems)
        .values({
          runId,
          attemptId: attempt.id,
          variantId: variant.id,
          datasetItemId: datasetItem.id,
          pipelineName: variant.pipelineName,
          configYaml: snapshotConfigYaml(variant.configYaml),
          stage: 'submitted',
          outputS3Prefix,
        })
        .returning();
      itemRows.push(row!);
    }
  }

  await db
    .update(appEvalRuns)
    .set({
      status: 'running',
      phase: 'transcribing',
      totalRunItems: itemRows.length,
      completedRunItems: 0,
      failedRunItems: 0,
      totalCompareItems: 0,
      completedCompareItems: 0,
      failedCompareItems: 0,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunAttempts)
    .set({
      totalRunItems: itemRows.length,
      completedRunItems: 0,
      failedRunItems: 0,
      totalCompareItems: 0,
      completedCompareItems: 0,
      failedCompareItems: 0,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, attempt.id));

  await db
    .update(appEvalRunVariants)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));

  await orchestrateEvalRunDispatch(runId);

  return getEvalRunDetail(runId);
}

export async function maybeFinalizeEvalRunPhase(runId: string): Promise<void> {
  const run = await getEvalRunById(runId);
  if (!run || run.status !== 'running') return;

  if (run.phase === 'comparing') {
    const { reconcileAndResumeEvalRunComparePhase } = await import('./eval-run-compare.ts');
    await reconcileAndResumeEvalRunComparePhase(runId);
    return;
  }

  if (run.phase === 'judging') {
    const { reconcileAndResumeEvalRunJudgePhase } = await import('./eval-run-judge.ts');
    await reconcileAndResumeEvalRunJudgePhase(runId);
    return;
  }

  const items = await listActiveAttemptItems(runId);
  const completion = computeEvalRunCompletion(items);
  if (!completion) return;

  const attempt = await getLatestEvalRunAttempt(runId);

  if (run.runMode === 'full' && completion.completedRunItems > 0) {
    await db
      .update(appEvalRuns)
      .set({
        completedRunItems: completion.completedRunItems,
        failedRunItems: completion.failedRunItems,
        updatedAt: new Date(),
      })
      .where(eq(appEvalRuns.id, runId));

    if (run.judgeEnabled) {
      await startEvalRunJudgePhase(runId, attempt?.id);
      const { reconcileAndResumeEvalRunJudgePhase } = await import('./eval-run-judge.ts');
      await reconcileAndResumeEvalRunJudgePhase(runId);
      return;
    }

    await startEvalRunComparePhase(runId, attempt?.id);
    const { reconcileAndResumeEvalRunComparePhase } = await import('./eval-run-compare.ts');
    await reconcileAndResumeEvalRunComparePhase(runId);
    return;
  }

  await db
    .update(appEvalRuns)
    .set({
      status: completion.status,
      phase: completion.phase,
      completedRunItems: completion.completedRunItems,
      failedRunItems: completion.failedRunItems,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  if (attempt) {
    await syncEvalRunAttemptFromRun(attempt.id, runId);
  }

  const variantStatus = completion.status === 'failed' ? 'failed' : 'done';
  await db
    .update(appEvalRunVariants)
    .set({ status: variantStatus, updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));
}

export async function reconcileStaleEvalRunItems(runId: string): Promise<void> {
  const run = await getEvalRunById(runId);
  if (!run || run.status !== 'running') return;

  const items = await listActiveAttemptItems(runId);
  for (const item of items) {
    if (isTerminalEvalRunItemStage(item.stage)) continue;

    // Queued items (never dispatched) must not be stale-failed while an earlier job is stuck.
    if (item.stage === 'submitted' && !evalRunItemDispatchClaimed(item.metrics)) continue;

    const decision = shouldFailStaleEvalRunItem(item);

    if (!decision.stale) continue;

    await db
      .update(appEvalRunItems)
      .set({
        stage: 'failed',
        errorMessage: decision.message ?? 'Eval pipeline job timed out',
        updatedAt: new Date(),
      })
      .where(eq(appEvalRunItems.id, item.id));
  }

  await maybeAdvanceEvalRunAfterJobTerminal(runId);
}

export async function maybeAdvanceEvalRunAfterJobTerminal(runId: string): Promise<void> {
  await maybeFinalizeEvalRunPhase(runId);
  const run = await getEvalRunById(runId);
  if (!run || run.status !== 'running' || run.phase !== 'transcribing') return;

  const items = await listActiveAttemptItems(runId);
  const { shouldContinueEvalRunDispatch } = await import('./eval-run-phase.ts');
  if (!shouldContinueEvalRunDispatch(items)) {
    const { abortEvalRunTranscribeWithoutSuccess } = await import('./eval-run-dispatch.ts');
    await abortEvalRunTranscribeWithoutSuccess(runId);
    return;
  }

  const { dispatchNextEvalRunJob } = await import('./eval-run-dispatch.ts');
  await dispatchNextEvalRunJob(runId);
}

export async function getEvalRunDetail(runId: string) {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');

  await reconcileStaleEvalRunItems(runId);
  await migrateEvalRunComparePhaseToJudge(runId);
  const runAfterMigrate = await getEvalRunById(runId);
  if (runAfterMigrate?.phase !== 'comparing' || !runAfterMigrate.judgeEnabled) {
    const { reconcileAndResumeEvalRunComparePhase } = await import('./eval-run-compare.ts');
    await reconcileAndResumeEvalRunComparePhase(runId);
  }
  const { reconcileAndResumeEvalRunJudgePhase } = await import('./eval-run-judge.ts');
  await reconcileAndResumeEvalRunJudgePhase(runId);
  const refreshed = (await getEvalRunById(runId))!;

  const variants = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));

  const attempts = await listEvalRunAttempts(runId);
  const items = await db.select().from(appEvalRunItems).where(eq(appEvalRunItems.runId, runId));
  const comparisons = await db
    .select()
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.runId, runId));

  const judgeJobs = await db
    .select()
    .from(appEvalRunJudgeJobs)
    .where(eq(appEvalRunJudgeJobs.runId, runId));

  const datasetItems = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, refreshed.datasetId));

  const datasetItemById = new Map(datasetItems.map((row) => [row.id, row]));

  const attemptDetails = await Promise.all(
    attempts.map(async (attempt) => {
      const attemptItems = items.filter((item) => item.attemptId === attempt.id);
      const attemptComparisons = comparisons.filter((row) => row.attemptId === attempt.id);
      const attemptJudgeJobs = judgeJobs.filter((row) => row.attemptId === attempt.id);
      const enrichedItems = await Promise.all(
        attemptItems.map((item) =>
          enrichEvalRunItemPublic(
            item,
            datasetItemById.get(item.datasetItemId)?.name ?? '',
          ),
        ),
      );
      return {
        ...toAttemptPublic(attempt),
        items: enrichedItems,
        comparisons: attemptComparisons.map((row) => ({
          id: row.id,
          run_id: row.runId,
          attempt_id: row.attemptId,
          dataset_item_id: row.datasetItemId,
          dataset_item_name: datasetItemById.get(row.datasetItemId)?.name ?? '',
          status: row.status,
          error_message: row.errorMessage,
          updated_at: row.updatedAt.toISOString(),
        })),
        judge_jobs: await Promise.all(
          attemptJudgeJobs.map(async (row) => ({
            id: row.id,
            run_id: row.runId,
            attempt_id: row.attemptId,
            dataset_item_id: row.datasetItemId,
            dataset_item_name: datasetItemById.get(row.datasetItemId)?.name ?? '',
            scenario_id: row.scenarioId,
            status: row.status,
            error_message: row.errorMessage,
            summary_metrics: row.summaryMetrics,
            result_url:
              row.status === 'done' && row.resultS3Key
                ? await getStorageReadUrl(row.resultS3Key, 3600)
                : null,
            updated_at: row.updatedAt.toISOString(),
          })),
        ),
      };
    }),
  );

  const latestAttempt = attempts[0] ?? null;

  return {
    run: toRunPublic(refreshed),
    variants: variants.map(toVariantPublic),
    attempts: attemptDetails,
    items: latestAttempt
      ? attemptDetails.find((attempt) => attempt.id === latestAttempt.id)?.items ?? []
      : [],
    comparisons: latestAttempt
      ? attemptDetails.find((attempt) => attempt.id === latestAttempt.id)?.comparisons ?? []
      : [],
    judge_jobs: latestAttempt
      ? attemptDetails.find((attempt) => attempt.id === latestAttempt.id)?.judge_jobs ?? []
      : [],
    dataset_items: datasetItems.map((row) => ({
      id: row.id,
      name: row.name,
      file_type: row.fileType,
    })),
  };
}

export async function getEvalRunCompareUrls(
  runId: string,
  datasetItemId: string,
  attemptId?: string,
) {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');

  const resolvedAttemptId =
    attemptId?.trim() || (await getLatestEvalRunAttempt(runId))?.id || null;
  if (!resolvedAttemptId) throw new Error('No evaluation attempt found for this run');

  const items = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, resolvedAttemptId));

  const targetItems = items.filter((item) => item.datasetItemId === datasetItemId);
  if (targetItems.length === 0) throw new Error('Dataset item not found in this attempt');

  const variants = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const comparisons = [];
  for (const item of targetItems) {
    const variant = variantById.get(item.variantId);
    if (!variant) continue;
    const entry: {
      variant_id: string;
      pipeline_name: string;
      display_name: string;
      stage: EvalRunItemStage;
      transcript_url: string | null;
      error_message: string | null;
    } = {
      variant_id: variant.id,
      pipeline_name: variant.pipelineName,
      display_name: variant.displayName,
      stage: item.stage as EvalRunItemStage,
      transcript_url: null,
      error_message: item.errorMessage,
    };
    if (item.stage === 'done' && item.transcriptS3Key) {
      entry.transcript_url = await getStorageReadUrl(item.transcriptS3Key, 3600);
    }
    comparisons.push(entry);
  }

  return { dataset_item_id: datasetItemId, attempt_id: resolvedAttemptId, comparisons };
}

export async function deleteEvalRun(runId: string): Promise<void> {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');
  if (run.status === 'running') throw new Error('Cannot delete a running eval run');

  const datasetId = run.datasetId;
  await db.delete(appEvalRuns).where(eq(appEvalRuns.id, runId));

  const [otherRun] = await db
    .select({ id: appEvalRuns.id })
    .from(appEvalRuns)
    .where(eq(appEvalRuns.datasetId, datasetId))
    .limit(1);
  if (!otherRun) {
    try {
      await deleteEvalDataset(datasetId);
    } catch {
      // Dataset may already be gone or shared storage cleanup failed; run row is deleted.
    }
  }
}

export async function getEvalRunDatasetId(runId: string): Promise<string> {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');
  return run.datasetId;
}

export async function assertEvalRunFilesMutable(runId: string): Promise<string> {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');
  if (run.status === 'running') {
    throw new Error('Cannot change files while this evaluation run is in progress');
  }
  return run.datasetId;
}

export async function listEvalRunProcessingOptions() {
  const { listPipelineConfigs } = await import('../shared/pipeline-config-store.ts');
  const { pipelines } = await listPipelineConfigs({ enabledOnly: true, limit: 100 });
  return {
    transcription_pipelines: pipelines
      .filter((pipeline) => isAudioAsyncPipelineName(pipeline.pipelineName))
      .map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        pipeline_name: pipeline.pipelineName,
      })),
  };
}

export function resolveEvalRunStatusLabel(status: EvalRunStatus): string {
  if (status === 'completed_with_errors') return 'Completed with errors';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
