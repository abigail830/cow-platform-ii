import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEvalRunComparisonKey,
  buildEvalRunItemOutputPrefix,
  evalRunAsrResultKey,
  evalRunTranscriptKey,
} from './eval-run-files.ts';

describe('eval-run-files', () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const variantId = '22222222-2222-4222-8222-222222222222';
  const itemId = '33333333-3333-4333-8333-333333333333';

  it('builds isolated output prefixes per run attempt variant item', () => {
    const prefix = buildEvalRunItemOutputPrefix(runId, attemptId, variantId, itemId);
    assert.equal(
      prefix,
      `eval-runs/${runId}/attempts/${attemptId}/variants/${variantId}/items/${itemId}/`,
    );
  });

  it('derives transcript and asr artifact keys from output prefix', () => {
    const prefix = buildEvalRunItemOutputPrefix(runId, attemptId, variantId, itemId);
    assert.equal(evalRunTranscriptKey(prefix), `${prefix}transcript.md`);
    assert.equal(evalRunAsrResultKey(prefix), `${prefix}asr_result.json`);
  });

  it('builds comparison keys scoped to attempt', () => {
    const key = buildEvalRunComparisonKey(runId, attemptId, itemId);
    assert.equal(key, `eval-runs/${runId}/attempts/${attemptId}/comparisons/${itemId}.json`);
  });
});
