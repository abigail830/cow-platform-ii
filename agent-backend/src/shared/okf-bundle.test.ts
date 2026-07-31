import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backendRoot, resolveBackendRootFromModuleDir } from '../agent-catalog/paths.ts';
import { resolveOkfBundleRoot } from './okf-bundle.ts';

test('backendRoot points at agent-backend in dev', () => {
  assert.ok(existsSync(join(backendRoot, 'agent-catalog')));
});

test('resolveBackendRootFromModuleDir uses function dir on Vercel layout', () => {
  const handlerDir = resolve(backendRoot, '.vercel/output/functions/index.func');
  if (!existsSync(join(handlerDir, 'agent-catalog'))) return;

  assert.equal(resolveBackendRootFromModuleDir(handlerDir), handlerDir);
});

test('resolveOkfBundleRoot reports missing OKF_BUNDLE_PATH clearly', () => {
  const previous = process.env.OKF_BUNDLE_PATH;
  delete process.env.OKF_BUNDLE_PATH;

  try {
    assert.throws(
      () => resolveOkfBundleRoot({ kind: 'env', envVar: 'OKF_BUNDLE_PATH' }),
      /OKF bundle is not configured: environment variable OKF_BUNDLE_PATH is not set/,
    );
  } finally {
    if (previous !== undefined) process.env.OKF_BUNDLE_PATH = previous;
    else delete process.env.OKF_BUNDLE_PATH;
  }
});

test('resolveOkfBundleRoot reports invalid OKF_BUNDLE_PATH clearly', () => {
  const previous = process.env.OKF_BUNDLE_PATH;
  process.env.OKF_BUNDLE_PATH = 'definitely-not-a-bundle';

  try {
    assert.throws(
      () => resolveOkfBundleRoot({ kind: 'env', envVar: 'OKF_BUNDLE_PATH' }),
      /OKF bundle path is invalid: OKF_BUNDLE_PATH="definitely-not-a-bundle"/,
    );
  } finally {
    if (previous !== undefined) process.env.OKF_BUNDLE_PATH = previous;
    else delete process.env.OKF_BUNDLE_PATH;
  }
});
