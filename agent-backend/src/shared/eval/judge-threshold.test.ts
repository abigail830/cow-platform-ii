import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePassThreshold,
  judgeScoreCompareValue,
  parsePassThresholdExpression,
} from './judge-threshold.ts';

describe('judge-threshold', () => {
  it('parses comparison expressions', () => {
    assert.deepEqual(parsePassThresholdExpression('>=7'), { op: '>=', value: 7, isPercent: false });
    assert.deepEqual(parsePassThresholdExpression('<0.3%'), {
      op: '<',
      value: 0.3,
      isPercent: true,
    });
    assert.equal(parsePassThresholdExpression(''), null);
  });

  it('evaluates GEval thresholds on 0–10 display scale', () => {
    assert.equal(
      evaluatePassThreshold(9, '>=7', { kind: 'geval_score', scoreMax: 10 }),
      true,
    );
    assert.equal(
      evaluatePassThreshold(5, '>=7', { kind: 'geval_score', scoreMax: 10 }),
      false,
    );
    assert.equal(
      evaluatePassThreshold(0.9, '>=7', { kind: 'geval_score' }),
      true,
    );
  });

  it('evaluates CER thresholds with percent suffix', () => {
    assert.equal(
      evaluatePassThreshold(0.002, '<0.3%', { kind: 'cer_score', lowerIsBetter: true }),
      true,
    );
    assert.equal(
      evaluatePassThreshold(0.133, '<0.3%', { kind: 'cer_score', lowerIsBetter: true }),
      false,
    );
  });

  it('evaluates CER thresholds on raw fraction without percent suffix', () => {
    assert.equal(
      evaluatePassThreshold(0.002, '<0.003', { kind: 'cer_score', lowerIsBetter: true }),
      true,
    );
  });

  it('maps error-rate scores to percentage display values', () => {
    assert.equal(judgeScoreCompareValue(0.133, { kind: 'cer_score' }), 13.3);
  });
});
