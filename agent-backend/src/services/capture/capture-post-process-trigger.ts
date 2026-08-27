import { and, eq, isNotNull } from 'drizzle-orm';
import { appAudioCaptures, appAudios, db } from '../../db/index.ts';
import {
  createCapturePipelineJob,
  getLatestCapturePipelineJob,
} from '../audio/audio-capture-pipeline-jobs.ts';
import {
  resolveCapturePostProcessPipelineForChannel,
  spawnCapturePostProcessWorker,
} from '../audio/audio-capture-pipeline-runner.ts';
import { evaluateCaptureReadiness } from './capture-readiness.ts';
import { getLatestAudioPipelineJobsForAudios } from '../audio/audio-pipeline-jobs.ts';

export type { CaptureReadiness } from './capture-readiness.ts';
export { evaluateCaptureReadiness } from './capture-readiness.ts';

export async function assessCaptureReadiness(captureId: string) {
  const segments = await db
    .select({
      id: appAudios.id,
      status: appAudios.status,
      segmentIndex: appAudios.segmentIndex,
    })
    .from(appAudios)
    .where(and(eq(appAudios.captureId, captureId), isNotNull(appAudios.segmentIndex)));

  const segmentJobs = await getLatestAudioPipelineJobsForAudios(segments.map((segment) => segment.id));
  const activeJob = await getLatestCapturePipelineJob(captureId);
  return evaluateCaptureReadiness({
    segments: segments.map((segment) => {
      const job = segmentJobs.get(segment.id);
      return {
        status: segment.status,
        pipeline_job: job ? { stage: job.stage } : null,
      };
    }),
    latestJobStage: activeJob?.stage ?? null,
  });
}

export async function maybeStartCapturePostProcess(captureId: string): Promise<void> {
  const [capture] = await db
    .select()
    .from(appAudioCaptures)
    .where(eq(appAudioCaptures.id, captureId))
    .limit(1);
  if (!capture) return;

  const readiness = await assessCaptureReadiness(captureId);
  if (!readiness.ready) return;

  const pipeline = await resolveCapturePostProcessPipelineForChannel(capture.channelId);
  if (!pipeline?.isEnabled) {
    console.info(
      `[capture-post-process] pipeline disabled; skip capture ${captureId}`,
    );
    return;
  }

  const job = await createCapturePipelineJob({
    captureId,
    pipelineName: pipeline.pipelineName,
    configYaml: pipeline.configYaml,
  });

  await db
    .update(appAudioCaptures)
    .set({ status: 'post_processing', updatedAt: new Date() })
    .where(eq(appAudioCaptures.id, captureId));

  await spawnCapturePostProcessWorker(job.id, job.pipelineName);
}
