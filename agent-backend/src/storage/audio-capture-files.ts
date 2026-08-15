import { validateKey } from './prefix-utils.ts';
import { getStorageReadUrl } from './audio-files.ts';
import { readStorageText } from './document-content.ts';

export const CAPTURE_PREFIX = 'captures/';

export function captureStoragePrefix(captureId: string): string {
  const prefix = `${CAPTURE_PREFIX}${captureId}/`;
  validateKey(prefix);
  return prefix;
}

export function captureManifestS3Key(captureId: string): string {
  const key = `${captureStoragePrefix(captureId)}capture.json`;
  validateKey(key);
  return key;
}

export function structuredTranscriptS3Key(captureId: string): string {
  const key = `${captureStoragePrefix(captureId)}structured_transcript.json`;
  validateKey(key);
  return key;
}

export function recordingContextS3Key(captureId: string): string {
  const key = `${captureStoragePrefix(captureId)}recording_context.json`;
  validateKey(key);
  return key;
}

export function extractionS3Key(captureId: string): string {
  const key = `${captureStoragePrefix(captureId)}extraction.json`;
  validateKey(key);
  return key;
}

export function summaryS3Key(captureId: string): string {
  const key = `${captureStoragePrefix(captureId)}summary.md`;
  validateKey(key);
  return key;
}

export type CaptureArtifactName =
  | 'capture'
  | 'structured_transcript'
  | 'recording_context'
  | 'extraction';

export function captureArtifactS3Key(
  captureId: string,
  artifact: CaptureArtifactName,
): string {
  switch (artifact) {
    case 'capture':
      return captureManifestS3Key(captureId);
    case 'structured_transcript':
      return structuredTranscriptS3Key(captureId);
    case 'recording_context':
      return recordingContextS3Key(captureId);
    case 'extraction':
      return extractionS3Key(captureId);
    default:
      throw new Error(`Unknown capture artifact: ${artifact}`);
  }
}

export type CapturePostProcessArtifactKind =
  | 'structured_transcript'
  | 'recording_context'
  | 'extraction'
  | 'summary';

export type CapturePostProcessArtifactPresign = {
  artifact: CapturePostProcessArtifactKind;
  url: string;
};

export type CapturePostProcessArtifactBundle = {
  structured_transcript: unknown | null;
  recording_context: unknown | null;
  extraction: unknown | null;
  summary: string | null;
  missing: CapturePostProcessArtifactKind[];
};

const POST_PROCESS_ARTIFACT_KINDS: CapturePostProcessArtifactKind[] = [
  'structured_transcript',
  'recording_context',
  'extraction',
  'summary',
];

function capturePostProcessArtifactKey(
  captureId: string,
  artifact: CapturePostProcessArtifactKind,
): string {
  switch (artifact) {
    case 'structured_transcript':
      return structuredTranscriptS3Key(captureId);
    case 'recording_context':
      return recordingContextS3Key(captureId);
    case 'extraction':
      return extractionS3Key(captureId);
    case 'summary':
      return summaryS3Key(captureId);
    default:
      throw new Error(`Unknown capture post-process artifact: ${artifact}`);
  }
}

/** Presigned GET URLs only — signing is local; browser fetches OSS directly (avoids Vercel→OSS). */
export async function presignCapturePostProcessArtifacts(
  captureId: string,
  artifacts: CapturePostProcessArtifactKind[] = POST_PROCESS_ARTIFACT_KINDS,
): Promise<CapturePostProcessArtifactPresign[]> {
  const unique = [...new Set(artifacts)];
  return Promise.all(
    unique.map(async (artifact) => ({
      artifact,
      url: await getStorageReadUrl(capturePostProcessArtifactKey(captureId, artifact)),
    })),
  );
}

function parseStorageJson(text: string | null): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Worker/local only — do not call from Vercel request handlers (GET times out HK→OSS). */
export async function readCapturePostProcessArtifactBundle(
  captureId: string,
): Promise<CapturePostProcessArtifactBundle> {
  const keys = {
    structured_transcript: structuredTranscriptS3Key(captureId),
    recording_context: recordingContextS3Key(captureId),
    extraction: extractionS3Key(captureId),
  } as const;

  const [structuredText, contextText, extractionText, summaryText] = await Promise.all([
    readStorageText(keys.structured_transcript),
    readStorageText(keys.recording_context),
    readStorageText(keys.extraction),
    readStorageText(summaryS3Key(captureId)),
  ]);

  const structured_transcript = parseStorageJson(structuredText);
  const recording_context = parseStorageJson(contextText);
  const extraction = parseStorageJson(extractionText);
  const summary = summaryText?.trim() ? summaryText : null;

  const missing: CapturePostProcessArtifactBundle['missing'] = [];
  if (structured_transcript == null) missing.push('structured_transcript');
  if (recording_context == null) missing.push('recording_context');
  if (extraction == null) missing.push('extraction');
  if (summary == null) missing.push('summary');

  return { structured_transcript, recording_context, extraction, summary, missing };
}
