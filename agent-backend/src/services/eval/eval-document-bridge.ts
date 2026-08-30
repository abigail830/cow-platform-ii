import { eq } from 'drizzle-orm';
import { appEvalDatasetItems, appEvalRunItems, db, type PipelineJobStage } from '../../db/index.ts';
import {
  evalRunDocumentMarkdownKey,
  evalRunDocumentParseResultKey,
} from '../../storage/eval-run-files.ts';
import {
  createPipelineJob,
  getPipelineJobById,
  pipelineProviderForName,
  updatePipelineJob,
} from '../pipeline/pipeline-jobs.ts';
import { spawnAsyncPipelineWorker } from '../pipeline/pipeline-runner.ts';
import { getEvalRunItemById, snapshotConfigYaml, updateEvalRunItem } from './eval-pipeline-jobs.ts';
import {
  isDocumentPipelineTerminalStage,
  mapDocumentPipelineStageToEvalItemStage,
} from './eval-document-stage.ts';
import { ensureEvalShadowDocumentForDatasetItem } from './eval-shadow-document.ts';

export async function reconcileEvalDocumentPipelineJobsForRun(runId: string): Promise<void> {
  const { listActiveAttemptItems } = await import('./eval-runs.ts');
  const { shouldFailStaleDocumentPipelineJob } = await import('../pipeline/document-pipeline-stale.ts');

  const items = await listActiveAttemptItems(runId);
  for (const item of items) {
    if (!item.documentPipelineJobId) continue;

    const job = await getPipelineJobById(item.documentPipelineJobId);
    if (!job) continue;

    if (isDocumentPipelineTerminalStage(job.stage)) {
      await syncEvalRunItemFromDocumentPipelineJob(job.id);
      continue;
    }

    // Eval detail polls every ~5s — fail faster than library document jobs when GHA died without PATCH.
    const decision = shouldFailStaleDocumentPipelineJob({
      stage: job.stage,
      provider: job.provider,
      externalJobId: job.externalJobId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      submitStaleMs: 3 * 60 * 1000,
      parsedStaleMs: 90 * 1000,
    });
    if (!decision.stale || !decision.message) continue;

    await updatePipelineJob(job.id, {
      stage: 'failed',
      errorMessage: decision.message,
    });
    await syncEvalRunItemFromDocumentPipelineJob(job.id);
  }
}

export async function createEvalParseDocumentPipelineJob(
  evalRunItem: typeof appEvalRunItems.$inferSelect,
): Promise<typeof import('../../db/index.ts').appPipelineJobs.$inferSelect> {
  const provider = pipelineProviderForName(evalRunItem.pipelineName);
  if (!provider) {
    throw new Error(`Unsupported eval document pipeline: ${evalRunItem.pipelineName}`);
  }

  const documentId = await ensureEvalShadowDocumentForDatasetItem(evalRunItem.datasetItemId);

  const job = await createPipelineJob({
    documentId,
    pipelineName: evalRunItem.pipelineName,
    provider,
    configYaml: snapshotConfigYaml(evalRunItem.configYaml),
    evalRunItemId: evalRunItem.id,
  });

  await updateEvalRunItem(evalRunItem.id, { documentPipelineJobId: job.id });
  return job;
}

export async function dispatchEvalParseViaDocumentPipeline(
  evalRunItemId: string,
  pipelineName: string,
): Promise<void> {
  const item = await getEvalRunItemById(evalRunItemId);
  if (!item) throw new Error('Eval run item not found');

  let documentJobId = item.documentPipelineJobId;
  if (!documentJobId) {
    const job = await createEvalParseDocumentPipelineJob(item);
    documentJobId = job.id;
  }

  await spawnAsyncPipelineWorker(documentJobId, pipelineName);
}

export async function syncEvalRunItemFromDocumentPipelineJob(
  documentJobId: string,
): Promise<void> {
  const job = await getPipelineJobById(documentJobId);
  if (!job?.evalRunItemId) return;

  const evalItem = await getEvalRunItemById(job.evalRunItemId);
  if (!evalItem) return;

  const stage = job.stage as PipelineJobStage;
  const evalStage = mapDocumentPipelineStageToEvalItemStage(stage);

  if (stage === 'done') {
    await updateEvalRunItem(evalItem.id, {
      stage: 'done',
      externalJobId: job.externalJobId,
      transcriptS3Key: evalRunDocumentMarkdownKey(evalItem.outputS3Prefix),
      asrResultS3Key: evalRunDocumentParseResultKey(evalItem.outputS3Prefix),
      errorMessage: null,
    });
  } else if (stage === 'failed') {
    await updateEvalRunItem(evalItem.id, {
      stage: 'failed',
      externalJobId: job.externalJobId,
      errorMessage: job.errorMessage,
    });
  } else {
    await updateEvalRunItem(evalItem.id, {
      stage: evalStage,
      externalJobId: job.externalJobId,
    });
  }

  if (isDocumentPipelineTerminalStage(stage)) {
    const { maybeAdvanceEvalRunAfterJobTerminal } = await import('./eval-runs.ts');
    await maybeAdvanceEvalRunAfterJobTerminal(evalItem.runId);
  }
}

export async function buildEvalLinkedDocumentPipelineContextOverrides(
  evalRunItemId: string,
): Promise<{
  input_uri: string;
  s3_prefix: string;
  dataset_item_name: string;
} | null> {
  const [evalItem] = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.id, evalRunItemId))
    .limit(1);
  if (!evalItem) return null;

  const [datasetItem] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.id, evalItem.datasetItemId))
    .limit(1);
  if (!datasetItem) return null;

  const { getS3Config } = await import('../../storage/s3-config.ts');
  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  return {
    input_uri: `s3://${s3.bucket}/${datasetItem.s3Key}`,
    s3_prefix: evalItem.outputS3Prefix,
    dataset_item_name: datasetItem.name,
  };
}
