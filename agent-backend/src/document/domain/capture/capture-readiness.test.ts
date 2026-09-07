import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateCaptureReadiness } from './capture-readiness.ts';

describe('capture-readiness', () => {
  it('requires at least one segment', () => {
    const result = evaluateCaptureReadiness({ segmentStatuses: [] });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'no_segments');
  });

  it('waits until all segments are transcribed', () => {
    const result = evaluateCaptureReadiness({
      segmentStatuses: ['completed', 'running'],
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'segments_incomplete');
    assert.equal(result.completedCount, 1);
  });

  it('starts when all segments complete and no active post-process job', () => {
    const result = evaluateCaptureReadiness({
      segmentStatuses: ['completed', 'completed'],
      latestJobStage: null,
    });
    assert.equal(result.ready, true);
  });

  it('starts when all segments complete via pipeline job stage', () => {
    const result = evaluateCaptureReadiness({
      segments: [{ status: 'running', pipeline_job: { stage: 'done' } }],
      latestJobStage: null,
    });
    assert.equal(result.ready, true);
  });

  it('skips when post-process already done', () => {
    const result = evaluateCaptureReadiness({
      segmentStatuses: ['completed'],
      latestJobStage: 'done',
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'already_done');
  });
});
