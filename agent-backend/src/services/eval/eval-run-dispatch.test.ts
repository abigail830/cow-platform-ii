import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupEvalRunDispatchItemsByDatasetFile, type EvalRunDispatchItem } from './eval-run-dispatch-group.ts';

describe('eval-run-dispatch', () => {
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
