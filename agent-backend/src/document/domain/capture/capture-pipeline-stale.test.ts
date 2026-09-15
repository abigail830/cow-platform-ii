import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultCaptureSubmitStaleMs,
  shouldFailStaleCapturePipelineJob,
} from './capture-pipeline-stale.ts';

describe('capture-pipeline-stale', () => {
  it('fails submitted jobs after the submit stale window', () => {
    const createdAt = new Date('2026-09-14T08:00:00Z');
    const now = createdAt.getTime() + 11 * 60 * 1000;

    const decision = shouldFailStaleCapturePipelineJob({
      stage: 'submitted',
      createdAt,
      updatedAt: createdAt,
      now,
      submitStaleMs: 10 * 60 * 1000,
      inFlightStaleMs: 60 * 60 * 1000,
    });

    assert.equal(decision.stale, true);
    assert.match(decision.message ?? '', /did not start/i);
  });

  it('keeps fresh submitted jobs active', () => {
    const createdAt = new Date('2026-09-14T08:00:00Z');
    const decision = shouldFailStaleCapturePipelineJob({
      stage: 'submitted',
      createdAt,
      updatedAt: createdAt,
      now: createdAt.getTime() + 2 * 60 * 1000,
      submitStaleMs: 10 * 60 * 1000,
      inFlightStaleMs: 60 * 60 * 1000,
    });

    assert.equal(decision.stale, false);
  });

  it('fails in-flight stages after last PATCH goes stale', () => {
    const createdAt = new Date('2026-09-14T08:00:00Z');
    const updatedAt = new Date('2026-09-14T08:05:00Z');
    const now = updatedAt.getTime() + 61 * 60 * 1000;

    const decision = shouldFailStaleCapturePipelineJob({
      stage: 'extracting',
      createdAt,
      updatedAt,
      now,
      submitStaleMs: 10 * 60 * 1000,
      inFlightStaleMs: 60 * 60 * 1000,
    });

    assert.equal(decision.stale, true);
    assert.match(decision.message ?? '', /timed out/i);
  });

  it('ignores terminal stages', () => {
    const decision = shouldFailStaleCapturePipelineJob({
      stage: 'failed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(decision.stale, false);
  });

  it('uses github_actions submit stale default', () => {
    const ms = defaultCaptureSubmitStaleMs({
      PIPELINE_WORKER: 'github_actions',
    });
    assert.equal(ms, 10 * 60 * 1000);
  });
});
