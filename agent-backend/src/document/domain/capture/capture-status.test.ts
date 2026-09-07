import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCaptureStatusFromSegments, segmentAsrState } from './capture-status-resolve.ts';

describe('capture-status', () => {
  it('segmentAsrState treats uploaded without job as pending', () => {
    assert.equal(segmentAsrState({ status: 'uploaded' }), 'pending');
  });

  it('resolves ready when all segments completed', () => {
    const status = resolveCaptureStatusFromSegments(
      [{ status: 'completed' }, { status: 'completed', pipeline_job: { stage: 'done' } }],
      null,
    );
    assert.equal(status, 'ready');
  });

  it('resolves draft when segments uploaded but ASR not started', () => {
    const status = resolveCaptureStatusFromSegments(
      [{ status: 'uploaded' }, { status: 'uploaded' }],
      null,
    );
    assert.equal(status, 'draft');
  });

  it('resolves transcribing when any segment is running', () => {
    const status = resolveCaptureStatusFromSegments(
      [{ status: 'completed' }, { status: 'running' }],
      null,
    );
    assert.equal(status, 'transcribing');
  });

  it('prefers post-processing job stage', () => {
    const status = resolveCaptureStatusFromSegments(
      [{ status: 'completed' }],
      { stage: 'classifying' },
    );
    assert.equal(status, 'post_processing');
  });
});
