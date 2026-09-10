import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCaptureSegmentTranscriptOnly } from './capture-segment-preview.ts';

describe('isCaptureSegmentTranscriptOnly', () => {
  it('is false for audio recording segments', () => {
    assert.equal(isCaptureSegmentTranscriptOnly('audio'), false);
  });

  it('is true for transcript-mode captures', () => {
    assert.equal(isCaptureSegmentTranscriptOnly('transcript'), true);
  });

  it('is true when the segment itself is a transcript upload', () => {
    assert.equal(
      isCaptureSegmentTranscriptOnly('audio', { source_kind: 'transcript' }),
      true,
    );
  });
});
