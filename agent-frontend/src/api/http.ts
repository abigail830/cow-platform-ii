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
