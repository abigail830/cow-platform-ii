import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backendRoot, resolveBackendRootFromModuleDir } from '../agent-catalog/paths.ts';

test('backendRoot points at agent-backend in dev', () => {
  assert.ok(existsSync(join(backendRoot, 'agent-catalog')));
});

test('resolveBackendRootFromModuleDir uses function dir on Vercel layout', () => {
  const handlerDir = resolve(backendRoot, '.vercel/output/functions/index.func');
  if (!existsSync(join(handlerDir, 'agent-catalog'))) return;

  assert.equal(resolveBackendRootFromModuleDir(handlerDir), handlerDir);
  assert.ok(existsSync(join(handlerDir, 'okf-bundle', 'index.md')));
});
