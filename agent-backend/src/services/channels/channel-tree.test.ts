import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectChannelSubtreeIds } from './channel-tree.ts';

describe('collectChannelSubtreeIds', () => {
  it('includes root and all descendants', () => {
    const rows = [
      { id: 'root', parent_id: null },
      { id: 'a', parent_id: 'root' },
      { id: 'b', parent_id: 'a' },
      { id: 'other', parent_id: null },
    ];
    const ids = collectChannelSubtreeIds('root', rows);
    assert.deepEqual(new Set(ids), new Set(['root', 'a', 'b']));
  });

  it('returns only root when there are no children', () => {
    const rows = [{ id: 'solo', parent_id: null }];
    assert.deepEqual(collectChannelSubtreeIds('solo', rows), ['solo']);
  });
});
