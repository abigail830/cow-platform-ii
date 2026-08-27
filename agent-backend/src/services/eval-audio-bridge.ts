import { eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunItems,
  db,
  type AudioPipelineJobStage,
} from '../db/index.ts';
import {
  evalRunAsrResultKey,
  evalRunTranscriptKey,
} from '../storage/eval-run-files.ts';
import {
  createAudioPipelineJob,
  getAudioPipelineJobById,
} from './audio-pipeline-jobs.ts';
import { audioPipelineProviderForName } from './audio-pipeline-names.ts';
import { spawnAsyncAudioPipelineWorker } from './audio-pipeline-runner.ts';
import { getEvalRunItemById, snapshotConfigYaml, updateEvalRunItem } from './eval-pipeline-jobs.ts';
import { ensureEvalShadowAudioForDatasetItem } from './eval-shadow-audio.ts';

export async function createEvalTranscribeAudioPipelineJob(
  evalRunItem: typeof appEvalRunItems.$inferSelect,
): Promise<typeof import('../db/index.ts').appAudioPipelineJobs.$inferSelect> {
  const provider = audioPipelineProviderForName(evalRunItem.pipelineName);
  if (!provider) {
    throw new Error(`Unsupported eval pipeline: ${evalRunItem.pipelineName}`);
  }

  const audioId = await ensureEvalShadowAudioForDatasetItem(evalRunItem.datasetItemId);
  const job = await createAudioPipelineJob({
    audioId,
    pipelineName: evalRunItem.pipelineName,
    provider,
    configYaml: snapshotConfigYaml(evalRunItem.configYaml),
    evalRunItemId: evalRunItem.id,
  });

  await updateEvalRunItem(evalRunItem.id, { audioPipelineJobId: job.id });
  return job;
}

export async function dispatchEvalTranscribeViaAudioPipeline(
  evalRunItemId: string,
  pipelineName: string,
): Promise<void> {
  const item = await getEvalRunItemById(evalRunItemId);
  if (!item) throw new Error('Eval run item not found');

  let audioJobId = item.audioPipelineJobId;
  if (!audioJobId) {
    const job = await createEvalTranscribeAudioPipelineJob(item);
    audioJobId = job.id;
  }

  await spawnAsyncAudioPipelineWorker(audioJobId, pipelineName);
}

export async function syncEvalRunItemFromAudioPipelineJob(
  audioJobId: string,
): Promise<void> {
  const job = await getAudioPipelineJobById(audioJobId);
  if (!job?.evalRunItemId) return;

  const evalItem = await getEvalRunItemById(job.evalRunItemId);
  if (!evalItem) return;

  const stage = job.stage as AudioPipelineJobStage;
  if (stage === 'done') {
    await updateEvalRunItem(evalItem.id, {
      stage: 'done',
      externalJobId: job.externalJobId,
      transcriptS3Key: evalRunTranscriptKey(evalItem.outputS3Prefix),
      asrResultS3Key: evalRunAsrResultKey(evalItem.outputS3Prefix),
      errorMessage: null,
    });
  } else if (stage === 'failed') {
    await updateEvalRunItem(evalItem.id, {
      stage: 'failed',
      externalJobId: job.externalJobId,
      errorMessage: job.errorMessage,
    });
  } else if (stage === 'transcribing') {
    await updateEvalRunItem(evalItem.id, {
      stage: 'transcribing',
      externalJobId: job.externalJobId,
    });
  } else if (stage === 'submitted') {
    await updateEvalRunItem(evalItem.id, { stage: 'submitted' });
  }

  if (stage === 'done' || stage === 'failed' || stage === 'cancelled') {
    const { maybeAdvanceEvalRunAfterJobTerminal } = await import('./eval-runs.ts');
    await maybeAdvanceEvalRunAfterJobTerminal(evalItem.runId);
  }
}

export async function buildEvalLinkedAudioPipelineContextOverrides(
  evalRunItemId: string,
): Promise<{ input_uri: string; s3_prefix: string; dataset_item_name: string } | null> {
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

  const { getS3Config } = await import('../storage/s3-config.ts');
  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  return {
    input_uri: `s3://${s3.bucket}/${datasetItem.s3Key}`,
    s3_prefix: evalItem.outputS3Prefix,
    dataset_item_name: datasetItem.name,
  };
}
