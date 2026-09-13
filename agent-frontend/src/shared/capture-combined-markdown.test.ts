import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCaptureCombinedMarkdown } from './capture-combined-markdown.ts';

describe('capture-combined-markdown', () => {
  it('builds combined markdown from summary and extraction', () => {
    const md = buildCaptureCombinedMarkdown({
      title: 'Weekly sync',
      abstract: 'Team standup notes',
      summaryMd: 'Discussed launch timeline.',
      extraction: { topics: [{ topic_id: 't1', title: 'Launch' }] },
    });
    assert.ok(md?.includes('# Weekly sync'));
    assert.ok(md?.includes('## Abstract'));
    assert.ok(md?.includes('## Summary'));
    assert.ok(md?.includes('## Knowledge extraction'));
  });

  it('returns null when there is nothing to render', () => {
    assert.equal(buildCaptureCombinedMarkdown({ title: 'Empty' }), null);
  });
});
