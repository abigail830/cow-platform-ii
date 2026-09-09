/** Fields produced by LLM metadata extraction (not capture/system bookkeeping). */
export const METADATA_EXTRACTION_FIELDS = [
  'abstract',
  'author',
  'publish_date',
  'source',
  'tags',
  'categories',
  'title',
] as const;

function isEmptyMetadataValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** Whether document metadata still looks empty and warrants extraction. */
export function metadataNeedsExtraction(
  metadata: Record<string, unknown> | null | undefined,
  options?: { force?: boolean },
): boolean {
  if (options?.force) return true;
  return !hasExtractedMetadataContent(metadata);
}

/** True when at least one LLM extraction field has a non-empty value. */
export function hasExtractedMetadataContent(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const record = metadata ?? {};
  return METADATA_EXTRACTION_FIELDS.some((key) => !isEmptyMetadataValue(record[key]));
}

/** Remove LLM extraction fields before a manual re-run (keeps knowledge_* bookkeeping). */
export function stripExtractedMetadataFields(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) };
  for (const key of METADATA_EXTRACTION_FIELDS) {
    delete next[key];
  }
  return next;
}
