export function formatApiError(error: unknown, fallback = 'Request failed'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    const details = typeof record.details === 'string' ? record.details.trim() : '';
    if (message && details) return `${message} ${details}`;
    if (message) return message;
  }
  return fallback;
}

export async function readApiErrorMessage(
  response: Response,
  fallback?: string,
): Promise<string> {
  const text = await response.text();
  if (text.trim()) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      const formatted = formatApiError(data.error, '');
      if (formatted) return formatted;
    } catch {
      return text.trim().slice(0, 240);
    }
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return 'Backend unavailable — check that the API server is running.';
  }
  if (response.status === 403) {
    return 'You do not have permission for this action.';
  }
  return fallback ?? `HTTP ${response.status}`;
}
