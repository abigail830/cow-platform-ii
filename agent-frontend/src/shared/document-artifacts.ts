export function formatPageIndexDraft(pageIndex: Record<string, unknown> | null): string {
  return JSON.stringify(pageIndex ?? { structure: [] }, null, 2);
}

export function parsePageIndexDraft(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Page index must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Page index must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}
