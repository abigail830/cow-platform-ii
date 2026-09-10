/** Transcript-only segments have no original audio to play in the drawer. */
export function isCaptureSegmentTranscriptOnly(
  inputMode: string,
  metadata?: Record<string, unknown> | null,
): boolean {
  return inputMode === 'transcript' || metadata?.source_kind === 'transcript';
}
