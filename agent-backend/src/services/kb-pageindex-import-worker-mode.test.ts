import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveKbPageIndexImportWorkerMode } from './kb-pageindex-import-worker-mode.ts';

describe('kb-pageindex-import-worker-mode', () => {
  it('defaults to spawn locally', () => {
    assert.equal(resolveKbPageIndexImportWorkerMode({}), 'spawn');
    assert.equal(resolveKbPageIndexImportWorkerMode({ KB_PAGEINDEX_IMPORT_WORKER: 'spawn' }), 'spawn');
  });

  it('defaults to github_actions on Vercel', () => {
    assert.equal(resolveKbPageIndexImportWorkerMode({ VERCEL: '1' }), 'github_actions');
    assert.equal(
      resolveKbPageIndexImportWorkerMode({ KB_PAGEINDEX_IMPORT_WORKER: 'spawn', VERCEL: '1' }),
      'spawn',
    );
  });

  it('accepts github_actions alias', () => {
    assert.equal(resolveKbPageIndexImportWorkerMode({ KB_PAGEINDEX_IMPORT_WORKER: 'gha' }), 'github_actions');
  });
});
