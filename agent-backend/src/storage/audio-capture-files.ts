import { validateKey } from './prefix-utils.ts';
import { headStorageObject } from './audio-files.ts';

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
