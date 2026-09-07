import { eq } from 'drizzle-orm';
import { appDocumentCaptureSegments, appDocumentCaptures, db } from '../../infrastructure/db/index.ts';
import {
  getLatestDocumentCapturePipelineJob,
} from './document-capture-pipeline-jobs.ts';
import { evaluateCaptureReadiness } from '../domain/capture/capture-readiness.ts';
import {
  getLatestAudioPipelineJobsForDocumentCaptureSegments,
} from '../../audio/application/audio-pipeline-jobs.ts';
import {
  buildDocumentCaptureStatusSegments,
} from './document-capture-status.ts';

export async function assessDocumentCaptureReadiness(captureId: string) {
  const [capture] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, captureId))
    .limit(1);
  if (!capture) {
    return { ready: false, reason: 'no_segments', segmentCount: 0, completedCount: 0 };
  }

  const segments = await db
    .select()
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, captureId))
    .orderBy(appDocumentCaptureSegments.segmentIndex);

  const audioJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments(
    segments.map((segment) => segment.id),
  );
  const statusSegments = await buildDocumentCaptureStatusSegments(
    capture.inputMode,
    segments,
    audioJobs,
  );

  const activeJob = await getLatestDocumentCapturePipelineJob(captureId);
  return evaluateCaptureReadiness({
    segments: statusSegments,
    latestJobStage: activeJob?.stage ?? null,
  });
}
