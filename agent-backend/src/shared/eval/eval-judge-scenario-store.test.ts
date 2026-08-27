import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateJudgeDimensions } from './eval-judge-dimension-validate.ts';

describe('validateJudgeDimensions evaluation_steps', () => {
  const base = {
    id: 'readability',
    label: 'Readability',
    scope: 'variant' as const,
    kind: 'geval_score' as const,
    weight: 1,
    criteria: 'Use an integer score from 0 to 10 where 0 is unreadable and 10 is easy to read.',
  };

  it('omits evaluation_steps when not provided', () => {
    const [row] = validateJudgeDimensions([base]);
    assert.equal(row.evaluation_steps, undefined);
  });

  it('keeps non-empty evaluation_steps', () => {
    const [row] = validateJudgeDimensions([
      { ...base, evaluation_steps: ['Read the transcript.', 'Score 0-10.'] },
    ]);
    assert.deepEqual(row.evaluation_steps, ['Read the transcript.', 'Score 0-10.']);
  });

  it('drops evaluation_steps when all lines are blank', () => {
    const [row] = validateJudgeDimensions([{ ...base, evaluation_steps: ['', '   '] }]);
    assert.equal(row.evaluation_steps, undefined);
  });
});
