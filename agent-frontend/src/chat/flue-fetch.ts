/** History/admission JSON must not wait forever if Vercel buffers or the function stalls. */
export const FLUE_JSON_FETCH_TIMEOUT_MS = 20_000;

export function isFlueLiveStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://flue.invalid');
    const view = parsed.searchParams.get('view');
    const live = parsed.searchParams.get('live');
    return view === 'updates' || live === 'sse' || live === 'long-poll';
  } catch {
    return url.includes('view=updates') || url.includes('live=sse') || url.includes('live=long-poll');
  }
}

function mergeAbortSignals(left?: AbortSignal | null, right?: AbortSignal | null): AbortSignal | undefined {
  if (!left) return right ?? undefined;
  if (!right) return left;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([left, right]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }
  left.addEventListener('abort', abort, { once: true });
  right.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

export function createFlueFetch(
  timeoutMs = FLUE_JSON_FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isFlueLiveStreamUrl(url)) {
      return fetchImpl(input, init);
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = mergeAbortSignals(init?.signal, timeoutController.signal);
    return fetchImpl(input, { ...init, signal }).finally(() => clearTimeout(timer));
  };
}
