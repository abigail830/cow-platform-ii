import assert from 'node:assert/strict';
import test from 'node:test';
import { formatEvalDatasetDbError } from './eval-dataset-db-error.ts';

test('formatEvalDatasetDbError maps duplicate hash constraint', () => {
  const error = new Error('Failed query: insert into "app_eval_dataset_items" …', {
    cause: {
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_eval_dataset_items_dataset_hash"',
    },
  });
  assert.equal(formatEvalDatasetDbError(error), 'This file is already in the dataset');
});

test('formatEvalDatasetDbError hides raw SQL for other query failures', () => {
  const error = new Error('Failed query: insert into "app_eval_dataset_items" …', {
    cause: { message: 'connection reset by peer' },
  });
  assert.equal(formatEvalDatasetDbError(error), 'connection reset by peer');
});

test('formatEvalDatasetDbError passes through business errors', () => {
  assert.equal(formatEvalDatasetDbError(new Error('Dataset not found')), 'Dataset not found');
});
