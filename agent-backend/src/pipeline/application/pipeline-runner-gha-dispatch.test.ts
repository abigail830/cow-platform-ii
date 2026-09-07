import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipDuplicateGhaPipelineDispatch } from './pipeline-gha-dispatch.ts';

function jobRow(overrides: {
  stage?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    stage: overrides.stage ?? 'submitted',
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
  } as Parameters<typeof shouldSkipDuplicateGhaPipelineDispatch>[0];
}

describe('shouldSkipDuplicateGhaPipelineDispatch', () => {
  it('skips when job was dispatched recently after create', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const dispatched = new Date('2026-01-01T00:00:10Z');
    const now = dispatched.getTime() + 60_000;
    assert.equal(
      shouldSkipDuplicateGhaPipelineDispatch(
        jobRow({ createdAt: created, updatedAt: dispatched }),
        now,
      ),
      true,
    );
  });

  it('does not skip before first dispatch bump', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    assert.equal(
      shouldSkipDuplicateGhaPipelineDispatch(jobRow({ createdAt: t, updatedAt: t }), t.getTime() + 1000),
      false,
    );
  });

  it('does not skip after dispatch window expires', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const dispatched = new Date('2026-01-01T00:00:10Z');
    const now = dispatched.getTime() + 11 * 60 * 1000;
    assert.equal(
      shouldSkipDuplicateGhaPipelineDispatch(
        jobRow({ createdAt: created, updatedAt: dispatched }),
        now,
      ),
      false,
    );
  });

  it('does not skip non-submitted stages', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const updated = new Date('2026-01-01T00:00:10Z');
    assert.equal(
      shouldSkipDuplicateGhaPipelineDispatch(
        jobRow({ stage: 'parsed', createdAt: created, updatedAt: updated }),
        updated.getTime() + 1000,
      ),
      false,
    );
  });
});
