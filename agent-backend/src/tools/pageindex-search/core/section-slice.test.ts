import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectLineSortedNodes,
  findNodeById,
  sliceByLines,
  sliceByNodeId,
  trimStructure,
} from './section-slice.ts';

const markdown = [
  '# Intro',
  'Intro body',
  '',
  '## Details',
  'Detail line A',
  'Detail line B',
  '',
  '# Conclusion',
  'Done',
].join('\n');

const structure = [
  {
    title: 'Intro',
    node_id: '0001',
    line_num: 1,
    summary: 'Opening',
    nodes: [
      {
        title: 'Details',
        node_id: '0002',
        line_num: 4,
        summary: 'Nested details',
      },
    ],
  },
  {
    title: 'Conclusion',
    node_id: '0003',
    line_num: 8,
    summary: 'Closing',
  },
];

describe('findNodeById', () => {
  it('finds nested nodes', () => {
    const node = findNodeById(structure, '0002');
    assert.ok(node);
    assert.equal(node?.title, 'Details');
  });

  it('returns null for missing ids', () => {
    assert.equal(findNodeById(structure, '9999'), null);
  });
});

describe('collectLineSortedNodes', () => {
  it('returns nodes sorted by line_num', () => {
    const nodes = collectLineSortedNodes(structure);
    assert.deepEqual(
      nodes.map((n) => n.node_id),
      ['0001', '0002', '0003'],
    );
  });
});

describe('sliceByNodeId', () => {
  it('slices parent section until next sibling', () => {
    const result = sliceByNodeId(markdown, structure, '0001', 12000);
    assert.equal(result.error, undefined);
    assert.match(result.content, /^# Intro/);
    assert.match(result.content, /Detail line B/);
    assert.doesNotMatch(result.content, /# Conclusion/);
    assert.equal(result.locator?.node_id, '0001');
    assert.equal(result.locator?.line_num, 1);
  });

  it('slices nested node until parent sibling', () => {
    const result = sliceByNodeId(markdown, structure, '0002', 12000);
    assert.equal(result.error, undefined);
    assert.match(result.content, /^## Details/);
    assert.match(result.content, /Detail line A/);
    assert.doesNotMatch(result.content, /# Intro\n/);
    assert.doesNotMatch(result.content, /# Conclusion/);
    assert.equal(result.locator?.node_id, '0002');
  });

  it('slices final section to EOF', () => {
    const result = sliceByNodeId(markdown, structure, '0003', 12000);
    assert.equal(result.error, undefined);
    assert.equal(result.content, '# Conclusion\nDone');
  });

  it('truncates with next_hint', () => {
    const result = sliceByNodeId(markdown, structure, '0001', 12);
    assert.equal(result.truncated, true);
    assert.ok(result.next_hint);
    assert.ok(result.content.length <= 12);
  });
});

describe('sliceByLines', () => {
  it('uses 1-based inclusive start and exclusive end', () => {
    const result = sliceByLines(markdown, 4, 8, 12000);
    assert.equal(result.content, '## Details\nDetail line A\nDetail line B\n');
    assert.equal(result.locator?.line_num, 4);
  });
});

describe('trimStructure', () => {
  it('keeps only allowed fields and respects maxDepth', () => {
    const trimmed = trimStructure(structure, 1) as Array<Record<string, unknown>>;
    assert.equal(trimmed.length, 2);
    assert.equal(trimmed[0]?.title, 'Intro');
    assert.equal(trimmed[0]?.summary, 'Opening');
    assert.equal(trimmed[0]?.node_id, '0001');
    assert.equal(trimmed[0]?.nodes, undefined);
    assert.equal(trimmed[1]?.title, 'Conclusion');
  });

  it('keeps one child level at maxDepth=2', () => {
    const trimmed = trimStructure(structure, 2) as Array<Record<string, unknown>>;
    const children = trimmed[0]?.nodes as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(children));
    assert.equal(children[0]?.node_id, '0002');
    assert.equal(children[0]?.nodes, undefined);
  });
});
