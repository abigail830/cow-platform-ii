import { createHash } from 'node:crypto';

export type CaptureLibrarySourceKind = 'audio' | 'transcript';

export function shouldShadowCaptureAsLibraryDocument(
  inputMode: string | null | undefined,
): inputMode is CaptureLibrarySourceKind {
  return inputMode === 'audio' || inputMode === 'transcript';
}

export function resolveCaptureLibraryDocumentId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  if (typeof metadata.library_document_id === 'string' && metadata.library_document_id.trim()) {
    return metadata.library_document_id.trim();
  }
  return null;
}

export function resolveCaptureLegacyDocumentId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  if (typeof metadata.legacy_document_id === 'string' && metadata.legacy_document_id.trim()) {
    return metadata.legacy_document_id.trim();
  }
  return null;
}

/** Deterministic hash for the capture-level textualized markdown row (no OSS read). */
export function captureLibraryDocumentFileHash(captureId: string): string {
  return createHash('sha256').update(`capture:${captureId}:markdown`, 'utf8').digest('hex');
}

export function captureLibrarySourceKind(
  inputMode: string,
): CaptureLibrarySourceKind | null {
  return shouldShadowCaptureAsLibraryDocument(inputMode) ? inputMode : null;
}

export function parseLibrarySourceKind(
  metadata: Record<string, unknown> | null | undefined,
): CaptureLibrarySourceKind | null {
  const raw = metadata?.source_kind;
  return raw === 'audio' || raw === 'transcript' ? raw : null;
}
