import { validateKey } from './prefix-utils.ts';
import { headStorageObject } from './audio-files.ts';
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

const POST_PROCESS_ARTIFACT_KEYS = [
  structuredTranscriptS3Key,
  recordingContextS3Key,
  extractionS3Key,
] as const;

/** True when all three post-process JSON artifacts exist in object storage. */
export async function capturePostProcessArtifactsExist(captureId: string): Promise<boolean> {
  for (const keyFn of POST_PROCESS_ARTIFACT_KEYS) {
    const head = await headStorageObject(keyFn(captureId));
    if (!head.exists) return false;
  }
  return true;
}

export type CapturePostProcessArtifactBundle = {
  structured_transcript: unknown | null;
  recording_context: unknown | null;
  extraction: unknown | null;
  missing: Array<'structured_transcript' | 'recording_context' | 'extraction'>;
};

function parseStorageJson(text: string | null): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Read all post-process JSON artifacts in one round-trip to object storage. */
export async function readCapturePostProcessArtifactBundle(
  captureId: string,
): Promise<CapturePostProcessArtifactBundle> {
  const keys = {
    structured_transcript: structuredTranscriptS3Key(captureId),
    recording_context: recordingContextS3Key(captureId),
    extraction: extractionS3Key(captureId),
  } as const;

  const [structuredText, contextText, extractionText] = await Promise.all([
    readStorageText(keys.structured_transcript),
    readStorageText(keys.recording_context),
    readStorageText(keys.extraction),
  ]);

  const structured_transcript = parseStorageJson(structuredText);
  const recording_context = parseStorageJson(contextText);
  const extraction = parseStorageJson(extractionText);

  const missing: CapturePostProcessArtifactBundle['missing'] = [];
  if (structured_transcript == null) missing.push('structured_transcript');
  if (recording_context == null) missing.push('recording_context');
  if (extraction == null) missing.push('extraction');

  return { structured_transcript, recording_context, extraction, missing };
}
