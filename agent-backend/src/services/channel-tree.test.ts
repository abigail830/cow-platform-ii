import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildChannelTree, collectDescendantIds, type ChannelTreeRow } from './channel-tree.ts';

const ts = '2026-01-01T00:00:00.000Z';

function row(
  id: string,
  name: string,
  parentId: string | null,
  sortOrder = 0,
): ChannelTreeRow {
  return {
    id,
    name,
    description: null,
    parent_id: parentId,
    sort_order: sortOrder,
    pipeline_id: null,
    metadata_extraction_model_id: null,
    auto_start_pipeline: false,
    created_at: ts,
    updated_at: ts,
  };
}

describe('channel-tree', () => {
  it('builds nested channel trees from flat rows', () => {
    const tree = buildChannelTree([
      row('root', 'Root', null),
      row('child-a', 'Child A', 'root', 0),
      row('child-b', 'Child B', 'root', 1),
      row('grandchild', 'Grandchild', 'child-a', 0),
    ]);

    assert.equal(tree.length, 1);
    assert.equal(tree[0]!.id, 'root');
    assert.equal(tree[0]!.children.length, 2);
    assert.equal(tree[0]!.children[0]!.id, 'child-a');
    assert.equal(tree[0]!.children[0]!.children[0]!.id, 'grandchild');
  });

  it('collects all descendant ids for cycle prevention', () => {
    const rows = [
      { id: 'root', parent_id: null },
      { id: 'a', parent_id: 'root' },
      { id: 'b', parent_id: 'a' },
    ];
    const descendants = collectDescendantIds('root', rows);
    assert.deepEqual([...descendants].sort(), ['a', 'b']);
  });
});
