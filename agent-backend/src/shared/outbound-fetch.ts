export type OutboundFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  label?: string;
};

function formatFetchCause(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  if (!cause) return undefined;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export function formatOutboundFetchError(error: unknown, label: string, url: string): string {
  if (!(error instanceof Error)) return `${label} failed for ${url}`;
  const cause = formatFetchCause(error);
  if (error.message === 'fetch failed') {
    return cause
      ? `${label} unreachable at ${url} (${cause})`
      : `${label} unreachable at ${url}`;
  }
  return `${label} failed for ${url}: ${error.message}`;
}

export async function outboundFetch(
  url: string,
  options: OutboundFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = options.retries ?? 1;
  const label = options.label ?? 'Outbound request';
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(formatOutboundFetchError(lastError, label, url), { cause: lastError });
}
