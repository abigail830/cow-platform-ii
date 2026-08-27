import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultAudioSubmitStaleMs,
  shouldFailStaleAudioJob,
} from './audio-pipeline-stale.ts';

describe('audio-pipeline-stale', () => {
  it('fails submitted jobs without external_job_id after submit stale window', () => {
    const createdAt = new Date('2026-08-07T08:00:00Z');
    const updatedAt = new Date('2026-08-07T08:00:00Z');
    const now = createdAt.getTime() + 4 * 60 * 1000;

    const decision = shouldFailStaleAudioJob({
      stage: 'submitted',
      externalJobId: null,
      createdAt,
      updatedAt,
      now,
      submitStaleMs: 3 * 60 * 1000,
      transcribeStaleMs: 60 * 60 * 1000,
    });

    assert.equal(decision.stale, true);
    assert.match(decision.message ?? '', /did not start/i);
  });

  it('keeps fresh submitted jobs active', () => {
    const createdAt = new Date('2026-08-07T08:00:00Z');
    const decision = shouldFailStaleAudioJob({
      stage: 'submitted',
      externalJobId: null,
      createdAt,
      updatedAt: createdAt,
      now: createdAt.getTime() + 60 * 1000,
      submitStaleMs: 3 * 60 * 1000,
      transcribeStaleMs: 60 * 60 * 1000,
    });

    assert.equal(decision.stale, false);
  });

  it('uses shorter default submit stale for github_actions worker mode', () => {
    const ms = defaultAudioSubmitStaleMs({
      PIPELINE_WORKER: 'github_actions',
    });
    assert.equal(ms, 3 * 60 * 1000);
  });
});
