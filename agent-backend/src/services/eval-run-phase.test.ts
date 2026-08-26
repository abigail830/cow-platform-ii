import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEvalRunCompletion, computeEvalRunCompareCompletion, isTerminalEvalRunItemStage } from './eval-run-phase.ts';

describe('eval-run-phase', () => {
  it('detects terminal item stages', () => {
    assert.equal(isTerminalEvalRunItemStage('done'), true);
    assert.equal(isTerminalEvalRunItemStage('failed'), true);
    assert.equal(isTerminalEvalRunItemStage('cancelled'), true);
    assert.equal(isTerminalEvalRunItemStage('transcribing'), false);
  });

  it('returns null until all items reach a terminal stage', () => {
    const completion = computeEvalRunCompletion([
      { stage: 'done' },
      { stage: 'transcribing' },
    ]);
    assert.equal(completion, null);
  });

  it('marks run completed when every item succeeds', () => {
    const completion = computeEvalRunCompletion([
      { stage: 'done' },
      { stage: 'done' },
    ]);
    assert.deepEqual(completion, {
      status: 'completed',
      phase: 'done',
      completedRunItems: 2,
      failedRunItems: 0,
    });
  });

  it('marks run completed_with_errors when some items fail', () => {
    const completion = computeEvalRunCompletion([
      { stage: 'done' },
      { stage: 'failed' },
    ]);
    assert.deepEqual(completion, {
      status: 'completed_with_errors',
      phase: 'done',
      completedRunItems: 1,
      failedRunItems: 1,
    });
  });

  it('marks run failed when every item fails', () => {
    const completion = computeEvalRunCompletion([
      { stage: 'failed' },
      { stage: 'cancelled' },
    ]);
    assert.deepEqual(completion, {
      status: 'failed',
      phase: 'done',
      completedRunItems: 0,
      failedRunItems: 2,
    });
  });

  it('marks compare phase completed when every comparison succeeds', () => {
    const completion = computeEvalRunCompareCompletion([
      { status: 'done' },
      { status: 'done' },
    ]);
    assert.deepEqual(completion, {
      status: 'completed',
      phase: 'done',
      completedCompareItems: 2,
      failedCompareItems: 0,
    });
  });
});
