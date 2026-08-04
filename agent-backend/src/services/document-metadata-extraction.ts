export function channelHasMetadataExtraction(channel: {
  metadataExtractionAgentDefId: string | null;
  metadataExtractionModelId: string | null;
}): boolean {
  return Boolean(channel.metadataExtractionAgentDefId || channel.metadataExtractionModelId);
}

export function metadataNeedsExtraction(
  metadata: Record<string, unknown> | null | undefined,
  hasExtractionConfigured: boolean,
): boolean {
  if (!hasExtractionConfigured) return false;
  const values = Object.values(metadata ?? {});
  if (values.length === 0) return true;
  return values.every((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}
