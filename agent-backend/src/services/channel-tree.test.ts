import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChannelPath } from './channel-tree.ts';

describe('buildChannelPath', () => {
  it('joins ancestor channel names', () => {
    const rows = [
      { id: 'a', name: 'Root', parent_id: null },
      { id: 'b', name: 'Policies', parent_id: 'a' },
      { id: 'c', name: '2024', parent_id: 'b' },
    ];
    assert.equal(buildChannelPath('c', rows), 'Root/Policies/2024');
  });
});
