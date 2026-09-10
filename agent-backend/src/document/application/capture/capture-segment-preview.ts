import { and, eq } from 'drizzle-orm';
import { getStorageReadUrl, transcriptS3Key } from '../../../audio/infrastructure/audio-files.ts';
import { appDocumentCaptureSegments, db } from '../../../infrastructure/db/index.ts';
import { isCaptureSegmentTranscriptOnly } from '../../domain/capture/capture-segment-preview.ts';
import { getDocumentCaptureById } from '../document-captures.ts';

export type CaptureSegmentPreview = {
  playback_url: string | null;
  transcript_url: string;
  filename: string;
};

export async function presignCaptureSegmentPreview(
  captureId: string,
  segmentId: string,
): Promise<CaptureSegmentPreview | null> {
  const capture = await getDocumentCaptureById(captureId);
  if (!capture) return null;

  const [segment] = await db
    .select()
    .from(appDocumentCaptureSegments)
    .where(
      and(
        eq(appDocumentCaptureSegments.id, segmentId),
        eq(appDocumentCaptureSegments.captureId, captureId),
      ),
    )
    .limit(1);
  if (!segment) return null;
  if (capture.inputMode === 'document') {
    throw new Error('Segment preview is only available for audio and transcript captures');
  }

  const transcriptOnly = isCaptureSegmentTranscriptOnly(capture.inputMode, segment.metadata);
  const playbackKey = transcriptOnly ? null : segment.s3Key;
  const transcriptKey = transcriptOnly ? segment.s3Key : transcriptS3Key(segment.fileHash);

  const [playback_url, transcript_url] = await Promise.all([
    playbackKey ? getStorageReadUrl(playbackKey) : Promise.resolve(null),
    getStorageReadUrl(transcriptKey),
  ]);

  return {
    playback_url,
    transcript_url,
    filename: segment.name,
  };
}
