export function propagateDocMetadata(
  docMetadata: Record<string, unknown> | null | undefined,
  metadataKeys: string[],
): Record<string, unknown> | null {
  if (!metadataKeys.length) return null;
  const filtered: Record<string, unknown> = {};
  for (const key of metadataKeys) {
    if (docMetadata && key in docMetadata) {
      filtered[key] = docMetadata[key];
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : null;
}
