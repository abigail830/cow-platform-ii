import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveFlueLiveMode } from './flue-live-mode.ts';

test('resolveFlueLiveMode honors an explicit mode', () => {
  assert.equal(resolveFlueLiveMode({ VITE_FLUE_LIVE_MODE: 'sse' }), 'sse');
  assert.equal(resolveFlueLiveMode({ VITE_FLUE_LIVE_MODE: 'long-poll' }), 'long-poll');
});

test('resolveFlueLiveMode ignores leftover sse in production unless opted in', () => {
  assert.equal(resolveFlueLiveMode({ VITE_FLUE_LIVE_MODE: 'sse', PROD: true }), 'long-poll');
  assert.equal(
    resolveFlueLiveMode({ VITE_FLUE_LIVE_MODE: 'sse', VITE_FLUE_ALLOW_SSE: '1', PROD: true }),
    'sse',
  );
});

test('resolveFlueLiveMode defaults to long-poll in production', () => {
  assert.equal(resolveFlueLiveMode({ PROD: true }), 'long-poll');
});

test('resolveFlueLiveMode defaults to sse in local dev', () => {
  assert.equal(resolveFlueLiveMode({ PROD: false }), 'sse');
  assert.equal(resolveFlueLiveMode({}), 'sse');
});
