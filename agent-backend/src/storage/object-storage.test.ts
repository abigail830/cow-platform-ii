import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planMoveStorageOperations } from './object-storage.ts';

describe('planMoveStorageOperations', () => {
  it('plans copy+delete for a single object', () => {
    const plan = planMoveStorageOperations({
      items: [{ type: 'object', key: 'documents/a/original.pdf' }],
      destinationPrefix: 'archive/',
    });
    assert.equal(plan.skipped_count, 0);
    assert.deepEqual(plan.operations, [
      {
        kind: 'copy',
        source_key: 'documents/a/original.pdf',
        dest_key: 'archive/original.pdf',
      },
      { kind: 'delete', source_key: 'documents/a/original.pdf' },
    ]);
  });

  it('plans folder move from client-supplied descendant keys', () => {
    const plan = planMoveStorageOperations({
      items: [{ type: 'prefix', key: 'documents/a/' }],
      destinationPrefix: 'backup/',
      folderObjectKeys: {
        'documents/a/': ['documents/a/original.pdf', 'documents/a/markdown.md'],
      },
    });
    assert.equal(plan.skipped_count, 0);
    assert.equal(plan.operations.length, 4);
    assert.deepEqual(plan.operations[0], {
      kind: 'copy',
      source_key: 'documents/a/original.pdf',
      dest_key: 'backup/a/original.pdf',
    });
  });

  it('skips folder move when descendant keys are missing', () => {
    const plan = planMoveStorageOperations({
      items: [{ type: 'prefix', key: 'empty/' }],
      destinationPrefix: 'dest/',
      folderObjectKeys: {},
    });
    assert.equal(plan.skipped_count, 1);
    assert.equal(plan.operations.length, 0);
    assert.match(plan.errors[0] ?? '', /no objects listed/);
  });
});
