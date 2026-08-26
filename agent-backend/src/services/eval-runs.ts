import { asc, desc, eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunComparisons,
  appEvalRunItems,
  appEvalRunVariants,
  appEvalRuns,
  db,
  type EvalRunItemStage,
  type EvalRunMode,
  type EvalRunStatus,
} from '../db/index.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { getEvalDatasetById, listEvalDatasetItems } from './eval-datasets.ts';
import { computeEvalRunCompletion, isTerminalEvalRunItemStage } from './eval-run-phase.ts';
import { evalRunItemToPublic, snapshotConfigYaml } from './eval-pipeline-jobs.ts';
import { orchestrateEvalRunDispatch } from './eval-run-dispatch.ts';
import { buildEvalRunItemOutputPrefix } from '../storage/eval-run-files.ts';
import { isAudioAsyncPipelineName, audioPipelineProviderForName } from './audio-pipeline-names.ts';
import { getStorageReadUrl } from '../storage/document-files.ts';
import { shouldFailStaleAudioJob } from './audio-pipeline-stale.ts';
import { startEvalRunComparePhase } from './eval-run-compare.ts';

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
  return rows.map(toRunPublic);
}

export async function getEvalRunById(id: string) {
  const [row] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, id)).limit(1);
  return row ?? null;
}

export async function createEvalRun(input: {
  datasetId: string;
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

  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Dataset not found');
  if (dataset.mediaType !== 'audio') {
    throw new Error('Only audio datasets are supported in this version');
  }

  const items = await listEvalDatasetItems(input.datasetId);
  if (items.length === 0) throw new Error('Dataset has no files');

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

  const [run] = await db
    .insert(appEvalRuns)
    .values({
      datasetId: input.datasetId,
      name,
      description: input.description?.trim() || null,
      status: 'draft',
      phase: 'transcribing',
      runMode,
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

async function rollbackEvalRunStart(runId: string): Promise<void> {
  await db.delete(appEvalRunComparisons).where(eq(appEvalRunComparisons.runId, runId));
  await db.delete(appEvalRunItems).where(eq(appEvalRunItems.runId, runId));
  await db
    .update(appEvalRuns)
    .set({
      status: 'draft',
      phase: 'transcribing',
      totalRunItems: 0,
      completedRunItems: 0,
      failedRunItems: 0,
      totalCompareItems: 0,
      completedCompareItems: 0,
      failedCompareItems: 0,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));
  await db
    .update(appEvalRunVariants)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));
}

export async function startEvalRun(runId: string) {
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
    await rollbackEvalRunStart(runId);
    run = (await getEvalRunById(runId))!;
  }

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
      const outputS3Prefix = buildEvalRunItemOutputPrefix(runId, variant.id, datasetItem.id);
      const [row] = await db
        .insert(appEvalRunItems)
        .values({
          runId,
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
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId));

  await db
    .update(appEvalRunVariants)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));

  void orchestrateEvalRunDispatch(runId).catch((error) => {
    console.error(
      `[eval-run] orchestration failed for run ${runId}:`,
      error instanceof Error ? error.message : error,
    );
  });

  return getEvalRunDetail(runId);
}

export async function maybeFinalizeEvalRunPhase(runId: string): Promise<void> {
  const run = await getEvalRunById(runId);
  if (!run || run.status !== 'running') return;

  if (run.phase === 'comparing') {
    const { maybeFinalizeEvalRunComparePhase } = await import('./eval-run-compare.ts');
    await maybeFinalizeEvalRunComparePhase(runId);
    return;
  }

  const items = await db.select().from(appEvalRunItems).where(eq(appEvalRunItems.runId, runId));
  const completion = computeEvalRunCompletion(items);
  if (!completion) return;

  if (run.runMode === 'full' && completion.completedRunItems > 0) {
    await db
      .update(appEvalRuns)
      .set({
        completedRunItems: completion.completedRunItems,
        failedRunItems: completion.failedRunItems,
        updatedAt: new Date(),
      })
      .where(eq(appEvalRuns.id, runId));
    await startEvalRunComparePhase(runId);
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

  const variantStatus = completion.status === 'failed' ? 'failed' : 'done';
  await db
    .update(appEvalRunVariants)
    .set({ status: variantStatus, updatedAt: new Date() })
    .where(eq(appEvalRunVariants.runId, runId));
}

export async function reconcileStaleEvalRunItems(runId: string): Promise<void> {
  const run = await getEvalRunById(runId);
  if (!run || run.status !== 'running') return;

  const items = await db.select().from(appEvalRunItems).where(eq(appEvalRunItems.runId, runId));
  for (const item of items) {
    if (isTerminalEvalRunItemStage(item.stage)) continue;

    const decision = shouldFailStaleAudioJob({
      stage: item.stage,
      externalJobId: item.externalJobId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });

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
  const { dispatchNextEvalRunJob } = await import('./eval-run-dispatch.ts');
  await dispatchNextEvalRunJob(runId);
}

export async function getEvalRunDetail(runId: string) {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');

  await reconcileStaleEvalRunItems(runId);
  const refreshed = (await getEvalRunById(runId))!;

  const variants = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));

  const items = await db.select().from(appEvalRunItems).where(eq(appEvalRunItems.runId, runId));

  const comparisons = await db
    .select()
    .from(appEvalRunComparisons)
    .where(eq(appEvalRunComparisons.runId, runId));

  const datasetItems = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, refreshed.datasetId));

  const datasetItemById = new Map(datasetItems.map((row) => [row.id, row]));

  return {
    run: toRunPublic(refreshed),
    variants: variants.map(toVariantPublic),
    items: items.map((item) => ({
      ...evalRunItemToPublic(item),
      dataset_item_name: datasetItemById.get(item.datasetItemId)?.name ?? '',
    })),
    comparisons: comparisons.map((row) => ({
      id: row.id,
      run_id: row.runId,
      dataset_item_id: row.datasetItemId,
      dataset_item_name: datasetItemById.get(row.datasetItemId)?.name ?? '',
      status: row.status,
      error_message: row.errorMessage,
      updated_at: row.updatedAt.toISOString(),
    })),
  };
}

export async function getEvalRunCompareUrls(runId: string, datasetItemId: string) {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');

  const items = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.runId, runId));

  const targetItems = items.filter((item) => item.datasetItemId === datasetItemId);
  if (targetItems.length === 0) throw new Error('Dataset item not found in this run');

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

  return { dataset_item_id: datasetItemId, comparisons };
}

export async function deleteEvalRun(runId: string): Promise<void> {
  const run = await getEvalRunById(runId);
  if (!run) throw new Error('Eval run not found');
  if (run.status === 'running') throw new Error('Cannot delete a running eval run');

  await db.delete(appEvalRuns).where(eq(appEvalRuns.id, runId));
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
