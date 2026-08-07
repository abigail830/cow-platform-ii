import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDiscoveryText, flattenTocTitles, materializeDiscoveryFields } from './discovery-materialize.ts';

const pageIndex = {
  strategy: 'markdown-headings',
  structure: [
    {
      title: 'Overview',
      node_id: '0001',
      summary: 'High-level summary',
      nodes: [{ title: 'Details', node_id: '0002', prefix_summary: 'Detail prefix' }],
    },
    { title: 'Overview', node_id: '0003' },
  ],
};

describe('flattenTocTitles', () => {
  it('flattens unique titles in walk order', () => {
    assert.deepEqual(flattenTocTitles(pageIndex), ['Overview', 'Details']);
  });
});

describe('buildDiscoveryText', () => {
  it('joins name, channel, metadata, toc, and summaries', () => {
    const text = buildDiscoveryText({
      documentName: 'Policy.pdf',
      channelPath: 'legal/policies',
      metadata: {
        abstract: 'Leave policy',
        author: 'HR',
        source: 'handbook',
        tags: ['hr', 'leave'],
        categories: ['policy'],
      },
      pageIndex,
    });
    assert.match(text, /Policy\.pdf/);
    assert.match(text, /legal\/policies/);
    assert.match(text, /Leave policy/);
    assert.match(text, /HR/);
    assert.match(text, /\bhr\b/);
    assert.match(text, /Overview/);
    assert.match(text, /Details/);
    assert.match(text, /High-level summary/);
    assert.match(text, /Detail prefix/);
  });
});

describe('materializeDiscoveryFields', () => {
  it('returns discovery helpers together', () => {
    const result = materializeDiscoveryFields({
      documentName: 'Doc',
      channelPath: 'a/b',
      metadata: { abstract: 'Abs' },
      pageIndex,
      parsingResult: { page_count: 12 },
    });
    assert.equal(result.pageCount, 12);
    assert.equal(result.pageIndexStrategy, 'markdown-headings');
    assert.deepEqual(result.tocTitles, ['Overview', 'Details']);
    assert.match(result.discoveryText, /Abs/);
  });
});
