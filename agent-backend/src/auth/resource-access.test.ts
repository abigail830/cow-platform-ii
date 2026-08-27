import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChannelAncestorChain,
  filterChannelTreeWithAccess,
  mergeResourcePermissions,
  normalizeResourcePermissionFlags,
  resourcePermissionLabel,
  satisfiesResourcePermission,
  NO_RESOURCE_ACCESS,
  FULL_RESOURCE_ACCESS,
} from './resource-access-utils.ts';
import type { ChannelNode } from '../services/documents/documents.ts';

describe('resource-access helpers', () => {
  it('mergeResourcePermissions unions flags', () => {
    assert.deepEqual(
      mergeResourcePermissions(
        { read: true, write: false, manage: false },
        { read: false, write: true, manage: false },
      ),
      { read: true, write: true, manage: false },
    );
  });

  it('normalizeResourcePermissionFlags enforces manage ⊃ write ⊃ read', () => {
    assert.deepEqual(normalizeResourcePermissionFlags({ manage: true }), FULL_RESOURCE_ACCESS);
    assert.deepEqual(normalizeResourcePermissionFlags({ write: true }), {
      read: true,
      write: true,
      manage: false,
    });
    assert.deepEqual(normalizeResourcePermissionFlags({ read: true }), {
      read: true,
      write: false,
      manage: false,
    });
  });

  it('satisfiesResourcePermission checks implied levels', () => {
    const writeOnly = { read: true, write: true, manage: false };
    assert.equal(satisfiesResourcePermission(writeOnly, 'read'), true);
    assert.equal(satisfiesResourcePermission(writeOnly, 'write'), true);
    assert.equal(satisfiesResourcePermission(writeOnly, 'manage'), false);
  });

  it('resourcePermissionLabel formats rwm', () => {
    assert.equal(resourcePermissionLabel(FULL_RESOURCE_ACCESS), 'rwm');
    assert.equal(resourcePermissionLabel(NO_RESOURCE_ACCESS), '—');
  });

  it('buildChannelAncestorChain walks from leaf to root', () => {
    const rows = [
      { id: 'root', parent_id: null },
      { id: 'child', parent_id: 'root' },
      { id: 'leaf', parent_id: 'child' },
    ];
    assert.deepEqual(buildChannelAncestorChain('leaf', rows), ['leaf', 'child', 'root']);
  });

  it('filterChannelTreeWithAccess keeps ancestor nodes for readable descendants', () => {
    const tree: ChannelNode[] = [
      {
        id: 'root',
        name: 'Root',
        description: null,
        parent_id: null,
        sort_order: 0,
        pipeline_id: null,
        auto_start_pipeline: false,
        created_at: '',
        updated_at: '',
        children: [
          {
            id: 'child',
            name: 'Child',
            description: null,
            parent_id: 'root',
            sort_order: 0,
            pipeline_id: null,
            auto_start_pipeline: false,
            created_at: '',
            updated_at: '',
            children: [],
          },
        ],
      },
    ];

    const readable = new Set(['child']);
    const accessById = new Map([
      ['root', NO_RESOURCE_ACCESS],
      ['child', { read: true, write: false, manage: false }],
    ]);

    const filtered = filterChannelTreeWithAccess(tree, readable, accessById);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, 'root');
    assert.equal(filtered[0]?.children[0]?.id, 'child');
    assert.deepEqual(filtered[0]?.children[0]?.my_access, { read: true, write: false, manage: false });
  });
});
