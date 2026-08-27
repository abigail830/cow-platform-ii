/** Whether document metadata still looks empty and warrants extraction. */
export function metadataNeedsExtraction(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const values = Object.values(metadata ?? {});
  if (values.length === 0) return true;
  return values.every((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}
