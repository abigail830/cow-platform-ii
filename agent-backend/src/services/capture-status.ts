import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { appAudioCaptures, appAudios, type AudioCaptureStatus, db } from '../db/index.ts';
import { capturePostProcessArtifactsExist } from '../storage/audio-capture-files.ts';
import { isStorageEnabled } from '../storage/s3-config.ts';
import { getLatestCapturePipelineJob } from './audio-capture-pipeline-jobs.ts';
import { getLatestAudioPipelineJobsForAudios } from './audio-pipeline-jobs.ts';
import {
  resolveCaptureStatusFromSegments,
  type CaptureStatusSegment,
} from './capture-status-resolve.ts';

export {
  resolveCaptureStatusFromSegments,
  segmentAsrState,
  type CaptureStatusSegment,
  type SegmentAsrState,
} from './capture-status-resolve.ts';

export async function syncCaptureStatus(captureId: string): Promise<AudioCaptureStatus | null> {
  const [capture] = await db
    .select()
    .from(appAudioCaptures)
    .where(eq(appAudioCaptures.id, captureId))
    .limit(1);
  if (!capture) return null;

  const segmentRows = await db
    .select({
      id: appAudios.id,
      status: appAudios.status,
    })
    .from(appAudios)
    .where(and(eq(appAudios.captureId, captureId), isNotNull(appAudios.segmentIndex)))
    .orderBy(asc(appAudios.segmentIndex), asc(appAudios.createdAt));

  const jobs = await getLatestAudioPipelineJobsForAudios(segmentRows.map((row) => row.id));
  const segments: CaptureStatusSegment[] = segmentRows.map((row) => ({
    status: row.status,
    pipeline_job: jobs.get(row.id) ? { stage: jobs.get(row.id)!.stage } : null,
  }));

  const captureJob = await getLatestCapturePipelineJob(captureId);
  let nextStatus = resolveCaptureStatusFromSegments(
    segments,
    captureJob ? { stage: captureJob.stage } : null,
  );

  if (nextStatus === 'done' && captureJob?.stage === 'done' && isStorageEnabled()) {
    try {
      const artifactsExist = await capturePostProcessArtifactsExist(captureId);
      if (!artifactsExist) {
        nextStatus = 'ready';
      }
    } catch (error) {
      console.warn(
        `[capture-status] could not verify post-process artifacts for ${captureId}:`,
        error instanceof Error ? error.message : error,
      );
      // Keep the current DB status when storage is temporarily unreachable.
    }
  }

  if (capture.status !== nextStatus) {
    await db
      .update(appAudioCaptures)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(appAudioCaptures.id, captureId));
  }

  return nextStatus;
}
