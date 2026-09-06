import type { DocumentCaptureInputMode } from '../../db/index.ts';
import type { CaptureStatusSegment } from '../capture/capture-status-resolve.ts';
import { getLatestPipelineJobsForDocuments } from '../pipeline/pipeline-jobs.ts';

type SegmentRow = {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

function documentPipelineStageToAsrStage(stage: string): string {
  if (stage === 'done') return 'done';
  if (stage === 'failed') return 'failed';
  if (stage === 'submitted' || stage === 'parsed' || stage === 'extracted_metadata') {
    return 'transcribing';
  }
  return stage;
}

function documentPipelineStageToSegmentStatus(stage: string): string {
  if (stage === 'done') return 'completed';
  if (stage === 'failed') return 'failed';
  if (stage === 'submitted' || stage === 'parsed' || stage === 'extracted_metadata') return 'running';
  return 'uploaded';
}

export async function buildDocumentCaptureStatusSegments(
  inputMode: DocumentCaptureInputMode,
  segments: SegmentRow[],
  audioJobs: Map<string, { stage: string } | undefined>,
): Promise<CaptureStatusSegment[]> {
  if (inputMode === 'document') {
    const libraryDocIds = segments
      .map((segment) => {
        const meta = segment.metadata ?? {};
        return typeof meta.library_document_id === 'string' ? meta.library_document_id : null;
      })
      .filter((id): id is string => Boolean(id));

    const documentJobs = libraryDocIds.length
      ? await getLatestPipelineJobsForDocuments(libraryDocIds)
      : new Map();

    return segments.map((segment) => {
      const libraryDocumentId =
        typeof segment.metadata?.library_document_id === 'string'
          ? segment.metadata.library_document_id
          : null;
      const docJob = libraryDocumentId ? documentJobs.get(libraryDocumentId) : null;
      if (!docJob) {
        return { status: segment.status, pipeline_job: null };
      }
      return {
        status: documentPipelineStageToSegmentStatus(docJob.stage),
        pipeline_job: { stage: documentPipelineStageToAsrStage(docJob.stage) },
      };
    });
  }

  return segments.map((segment) => {
    const job = audioJobs.get(segment.id);
    return {
      status: segment.status,
      pipeline_job: job ? { stage: job.stage } : null,
    };
  });
}

export async function syncDocumentCaptureStatus(captureId: string) {
  const { appDocumentCaptures, db } = await import('../../db/index.ts');
  const { eq } = await import('drizzle-orm');
  const { resolveCaptureStatusFromSegments } = await import('../capture/capture-status-resolve.ts');
  const { getLatestDocumentCapturePipelineJob } = await import('./document-capture-pipeline-jobs.ts');
  const { getLatestAudioPipelineJobsForDocumentCaptureSegments } = await import(
    '../audio/audio-pipeline-jobs.ts'
  );
  const { appDocumentCaptureSegments } = await import('../../db/index.ts');

  const [capture] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, captureId))
    .limit(1);
  if (!capture) return null;

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

  const captureJob = await getLatestDocumentCapturePipelineJob(captureId);
  const nextStatus = resolveCaptureStatusFromSegments(
    statusSegments,
    captureJob ? { stage: captureJob.stage } : null,
  );

  if (capture.status !== nextStatus) {
    await db
      .update(appDocumentCaptures)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(appDocumentCaptures.id, captureId));
  }

  return nextStatus;
}
