import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCaptureStatusLabel,
  isCapturePipelineActive,
  RECORDING_MODE_LABELS,
} from './audioCaptures.ts';

test('formatCaptureStatusLabel maps known statuses', () => {
  assert.equal(formatCaptureStatusLabel('post_processing'), 'Post-processing');
  assert.equal(formatCaptureStatusLabel('done'), 'Done');
});

test('isCapturePipelineActive detects transcribing and post-process stages', () => {
  assert.equal(isCapturePipelineActive({ status: 'transcribing', pipeline_job: null }), true);
  assert.equal(
    isCapturePipelineActive({
      status: 'post_processing',
      pipeline_job: { id: 'j', stage: 'structuring', pipeline_name: 'x', error_message: null, updated_at: '' },
    }),
    true,
  );
  assert.equal(isCapturePipelineActive({ status: 'done', pipeline_job: null }), false);
});

test('RECORDING_MODE_LABELS covers general mode', () => {
  assert.equal(RECORDING_MODE_LABELS.general, 'General');
});
