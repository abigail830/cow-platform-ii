import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canRetryJob,
  getDefaultRetryPolicy,
  getRetryAttempt,
  mergeAsyncJobMetrics,
  resolveAsyncJobPatchMetrics,
} from '../domain/async-job-retry-policy.ts';
import {
  inferFailedFromStage,
  resumeStageForFailedJob,
} from '../domain/async-job-stages.ts';

describe('async-job-retry', () => {
  it('getDefaultRetryPolicy reads env defaults', () => {
    const policy = getDefaultRetryPolicy({});
    assert.equal(policy.maxAttempts, 2);
    assert.equal(policy.autoRetry, false);

    const custom = getDefaultRetryPolicy({
      ASYNC_JOB_MAX_ATTEMPTS: '4',
      ASYNC_JOB_AUTO_RETRY: 'true',
    });
    assert.equal(custom.maxAttempts, 4);
    assert.equal(custom.autoRetry, true);
  });

  it('mergeAsyncJobMetrics merges partial patches', () => {
    const merged = mergeAsyncJobMetrics(
      { retry_attempt: 1, max_attempts: 2 },
      { failed_from_stage: 'extracting', last_retry_at: '2026-01-01T00:00:00.000Z' },
    );
    assert.deepEqual(merged, {
      retry_attempt: 1,
      max_attempts: 2,
      failed_from_stage: 'extracting',
      last_retry_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('canRetryJob respects max attempts', () => {
    const policy = { maxAttempts: 2, autoRetry: false };
    assert.equal(canRetryJob({ retry_attempt: 1 }, policy), true);
    assert.equal(canRetryJob({ retry_attempt: 2 }, policy), false);
    assert.equal(getRetryAttempt(undefined), 1);
  });

  it('resumeStageForFailedJob returns capture materializing stage', () => {
    assert.equal(resumeStageForFailedJob('capture_pipeline', 'materializing'), 'materializing');
    assert.equal(resumeStageForFailedJob('capture_pipeline', 'synthesizing'), 'synthesizing');
    assert.equal(resumeStageForFailedJob('document_pipeline', 'parsed'), 'parsed');
  });

  it('inferFailedFromStage prefers metrics.failed_from_stage', () => {
    assert.equal(
      inferFailedFromStage('capture_pipeline', 'failed', { failed_from_stage: 'extracting' }),
      'extracting',
    );
    assert.equal(inferFailedFromStage('audio_pipeline', 'failed', null), 'transcribing');
  });

  it('resolveAsyncJobPatchMetrics records failure metadata', () => {
    const metrics = resolveAsyncJobPatchMetrics({
      domain: 'capture_pipeline',
      previousStage: 'synthesizing',
      existingMetrics: { retry_attempt: 1 },
      newStage: 'failed',
      metricsPatch: { last_error_code: 'timeout' },
    });
    assert.equal(metrics?.failed_from_stage, 'synthesizing');
    assert.equal(metrics?.retry_attempt, 1);
    assert.equal(metrics?.max_attempts, 2);
    assert.equal(metrics?.last_error_code, 'timeout');
  });
});
