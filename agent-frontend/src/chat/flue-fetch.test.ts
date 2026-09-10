import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFlueFetch, isFlueLiveStreamUrl } from './flue-fetch.ts';

test('isFlueLiveStreamUrl detects updates and live query params', () => {
  assert.equal(isFlueLiveStreamUrl('https://api.example/api/agents/a/b?view=updates&offset=-1'), true);
  assert.equal(isFlueLiveStreamUrl('/api/agents/a/b?view=updates'), true);
  assert.equal(isFlueLiveStreamUrl('https://api.example/api/agents/a/b?view=history'), false);
  assert.equal(isFlueLiveStreamUrl('https://api.example/api/agents/a/b?live=sse'), true);
});

test('createFlueFetch times out non-stream JSON requests', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    await new Promise<void>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      });
    });
    throw new Error('unreachable');
  };
  const fetchWithTimeout = createFlueFetch(20, fetchImpl);
  await assert.rejects(
    () => fetchWithTimeout('https://api.example/api/agents/a/b?view=history'),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
});

test('createFlueFetch does not time out live update streams', async () => {
  let timedOut = false;
  const fetchImpl: typeof fetch = async (_input, init) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 40);
      init?.signal?.addEventListener(
        'abort',
        () => {
          timedOut = true;
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    return new Response('{}', { status: 200 });
  };
  const fetchWithTimeout = createFlueFetch(20, fetchImpl);
  await fetchWithTimeout('https://api.example/api/agents/a/b?view=updates&offset=-1&live=long-poll');
  assert.equal(timedOut, false);
});
