import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evalRunItemDispatchClaimed } from './eval-run-phase.ts';
import { groupEvalRunDispatchItemsByDatasetFile, type EvalRunDispatchItem } from './eval-run-dispatch-group.ts';

function evalRunItemInFlight(stage: string, metrics: unknown): boolean {
  if (stage === 'transcribing') return true;
  return stage === 'submitted' && evalRunItemDispatchClaimed(metrics);
}

describe('eval-run-dispatch', () => {
  it('treats submitted+claimed items as in-flight (blocks parallel GHA dispatch)', () => {
    assert.equal(
      evalRunItemInFlight('submitted', { dispatch_claimed_at: '2026-01-01T00:00:00.000Z' }),
      true,
    );
    assert.equal(evalRunItemInFlight('submitted', {}), false);
    assert.equal(evalRunItemInFlight('transcribing', {}), true);
    assert.equal(evalRunItemInFlight('done', { dispatch_claimed_at: 'x' }), false);
  });

  it('groups dispatch items by dataset file order', () => {
    const datasetItemIds = ['file-a', 'file-b', 'file-c'];
    const items: EvalRunDispatchItem[] = [
      { id: '1', pipelineName: 'p1', datasetItemId: 'file-a' },
      { id: '2', pipelineName: 'p2', datasetItemId: 'file-a' },
      { id: '3', pipelineName: 'p1', datasetItemId: 'file-b' },
      { id: '4', pipelineName: 'p2', datasetItemId: 'file-b' },
    ];

    const batches = groupEvalRunDispatchItemsByDatasetFile(datasetItemIds, items);
    assert.deepEqual(
      batches.map((batch) => batch.map((item) => item.id)),
      [
        ['1', '2'],
        ['3', '4'],
      ],
    );
  });
});
