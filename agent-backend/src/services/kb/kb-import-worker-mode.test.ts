import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveKbImportWorkerMode } from './kb-import-worker-mode.ts';

describe('kb-import-worker-mode', () => {
  it('defaults to spawn locally', () => {
    assert.equal(resolveKbImportWorkerMode({}), 'spawn');
    assert.equal(resolveKbImportWorkerMode({ KB_IMPORT_WORKER: 'spawn' }), 'spawn');
  });

  it('uses github_actions on Vercel', () => {
    assert.equal(resolveKbImportWorkerMode({ VERCEL: '1' }), 'github_actions');
  });

  it('falls back to legacy env name', () => {
    assert.equal(
      resolveKbImportWorkerMode({ KB_PAGEINDEX_IMPORT_WORKER: 'github_actions' }),
      'github_actions',
    );
  });
});
