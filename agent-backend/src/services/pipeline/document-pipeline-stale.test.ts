import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldFailStaleDocumentPipelineJob } from './document-pipeline-stale.ts';

describe('document-pipeline-stale', () => {
  it('flags stale parsed jobs waiting on metadata', () => {
    const now = Date.parse('2026-08-30T12:00:00.000Z');
    const decision = shouldFailStaleDocumentPipelineJob({
      stage: 'parsed',
      provider: 'paddle',
      externalJobId: null,
      createdAt: new Date(now - 10 * 60 * 1000),
      updatedAt: new Date(now - 6 * 60 * 1000),
      now,
      parsedStaleMs: 5 * 60 * 1000,
    });
    assert.equal(decision.stale, true);
    assert.match(decision.message ?? '', /metadata/i);
  });

  it('ignores terminal document pipeline jobs', () => {
    const decision = shouldFailStaleDocumentPipelineJob({
      stage: 'failed',
      provider: 'aliyun',
      externalJobId: 'task-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(decision.stale, false);
  });
});
