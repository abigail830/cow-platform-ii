import { eq } from 'drizzle-orm';
import { isTerminalEvalRunItemStage } from './eval-run-phase.ts';
import {
  appEvalDatasetItems,
  appEvalRunItems,
  appEvalRunVariants,
  db,
  type EvalRunItemStage,
} from '../../db/index.ts';
import { getS3Config } from '../../storage/s3-config.ts';
import {
  evalRunAsrResultKey,
  evalRunTranscriptKey,
} from '../../storage/eval-run-files.ts';
import { audioPipelineProviderForName } from '../audio/audio-pipeline-names.ts';

export const GENERIC_EVAL_GHA_FAILURE_MESSAGE =
  'GitHub Actions worker failed before eval pipeline completed';

export function resolveEvalPipelineJobErrorMessage(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = incoming?.trim() || null;
  const prev = existing?.trim();
  if (
    next === GENERIC_EVAL_GHA_FAILURE_MESSAGE &&
    prev &&
    prev !== GENERIC_EVAL_GHA_FAILURE_MESSAGE
  ) {
    return prev;
  }
  return next;
}

export function snapshotConfigYaml(configYaml: string | null | undefined): string | null {
  const raw = configYaml?.trim();
  return raw ? raw : null;
}

export type EvalPipelineJobContext = {
  id: string;
  run_id: string;
  variant_id: string;
  dataset_item_id: string;
  pipeline_name: string;
  provider: string;
  stage: EvalRunItemStage;
  external_job_id: string | null;
  config_yaml: string | null;
  error_message: string | null;
  dataset_item: {
    id: string;
    name: string;
    file_type: string;
    s3_key: string;
    file_hash: string;
  };
  input_uri: string;
  s3_prefix: string;
  api_url: string;
};

export async function getEvalRunItemById(
  id: string,
): Promise<typeof appEvalRunItems.$inferSelect | null> {
  const [row] = await db.select().from(appEvalRunItems).where(eq(appEvalRunItems.id, id)).limit(1);
  return row ?? null;
}

export async function updateEvalRunItem(
  id: string,
  input: {
    stage?: EvalRunItemStage;
    externalJobId?: string | null;
    errorMessage?: string | null;
    transcriptS3Key?: string | null;
    asrResultS3Key?: string | null;
    audioPipelineJobId?: string | null;
    metrics?: Record<string, unknown> | null;
  },
): Promise<typeof appEvalRunItems.$inferSelect | null> {
  let mergedMetrics: Record<string, unknown> | null | undefined;
  if (input.metrics !== undefined) {
    const existing = await getEvalRunItemById(id);
    if (input.metrics == null) {
      mergedMetrics = null;
    } else {
      const prior =
        existing?.metrics && typeof existing.metrics === 'object' && !Array.isArray(existing.metrics)
          ? (existing.metrics as Record<string, unknown>)
          : {};
      mergedMetrics = { ...prior, ...input.metrics };
    }
  }

  const [row] = await db
    .update(appEvalRunItems)
    .set({
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.externalJobId !== undefined ? { externalJobId: input.externalJobId } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      ...(input.transcriptS3Key !== undefined ? { transcriptS3Key: input.transcriptS3Key } : {}),
      ...(input.asrResultS3Key !== undefined ? { asrResultS3Key: input.asrResultS3Key } : {}),
      ...(input.audioPipelineJobId !== undefined
        ? { audioPipelineJobId: input.audioPipelineJobId }
        : {}),
      ...(mergedMetrics !== undefined ? { metrics: mergedMetrics } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunItems.id, id))
    .returning();
  return row ?? null;
}

export async function buildEvalPipelineJobContext(jobId: string): Promise<EvalPipelineJobContext> {
  const item = await getEvalRunItemById(jobId);
  if (!item) throw new Error('Eval pipeline job not found');

  const [variant] = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.id, item.variantId))
    .limit(1);
  if (!variant) throw new Error('Eval run variant not found');

  const [datasetItem] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.id, item.datasetItemId))
    .limit(1);
  if (!datasetItem) throw new Error('Dataset item not found');

  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  const pipelineName = item.pipelineName || variant.pipelineName;
  const provider = audioPipelineProviderForName(pipelineName);
  if (!provider) throw new Error(`Unsupported eval pipeline: ${pipelineName}`);

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  return {
    id: item.id,
    run_id: item.runId,
    variant_id: item.variantId,
    dataset_item_id: item.datasetItemId,
    pipeline_name: pipelineName,
    provider,
    stage: item.stage,
    external_job_id: item.externalJobId,
    config_yaml: snapshotConfigYaml(item.configYaml ?? variant.configYaml),
    error_message: item.errorMessage,
    dataset_item: {
      id: datasetItem.id,
      name: datasetItem.name,
      file_type: datasetItem.fileType,
      s3_key: datasetItem.s3Key,
      file_hash: datasetItem.fileHash,
    },
    input_uri: `s3://${s3.bucket}/${datasetItem.s3Key}`,
    s3_prefix: item.outputS3Prefix,
    api_url: apiUrl,
  };
}

export async function markEvalRunItemForJobStage(
  itemId: string,
  stage: EvalRunItemStage,
): Promise<void> {
  const item = await getEvalRunItemById(itemId);
  if (!item) return;

  if (stage === 'done') {
    await updateEvalRunItem(itemId, {
      stage: 'done',
      transcriptS3Key: evalRunTranscriptKey(item.outputS3Prefix),
      asrResultS3Key: evalRunAsrResultKey(item.outputS3Prefix),
      errorMessage: null,
    });
  } else if (stage === 'failed') {
    await updateEvalRunItem(itemId, { stage: 'failed' });
  } else {
    await updateEvalRunItem(itemId, { stage });
  }

  if (isTerminalEvalRunItemStage(stage)) {
    const { maybeAdvanceEvalRunAfterJobTerminal } = await import('./eval-runs.ts');
    await maybeAdvanceEvalRunAfterJobTerminal(item.runId);
    return;
  }

  await maybeFinalizeEvalRunPhase(item.runId);
}

async function maybeFinalizeEvalRunPhase(runId: string): Promise<void> {
  const { maybeFinalizeEvalRunPhase: finalize } = await import('./eval-runs.ts');
  await finalize(runId);
}

export function evalRunItemToPublic(item: typeof appEvalRunItems.$inferSelect) {
  return {
    id: item.id,
    run_id: item.runId,
    variant_id: item.variantId,
    dataset_item_id: item.datasetItemId,
    stage: item.stage,
    external_job_id: item.externalJobId,
    output_s3_prefix: item.outputS3Prefix,
    transcript_s3_key: item.transcriptS3Key,
    asr_result_s3_key: item.asrResultS3Key,
    error_message: item.errorMessage,
    metrics: item.metrics,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}
