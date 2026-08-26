import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEvalRunItemOutputPrefix,
  evalRunAsrResultKey,
  evalRunTranscriptKey,
} from './eval-run-files.ts';

describe('eval-run-files', () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const variantId = '22222222-2222-4222-8222-222222222222';
  const itemId = '33333333-3333-4333-8333-333333333333';

  it('builds isolated output prefixes per run variant item', () => {
    const prefix = buildEvalRunItemOutputPrefix(runId, variantId, itemId);
    assert.equal(
      prefix,
      `eval-runs/${runId}/variants/${variantId}/items/${itemId}/`,
    );
  });

  it('derives transcript and asr artifact keys from output prefix', () => {
    const prefix = buildEvalRunItemOutputPrefix(runId, variantId, itemId);
    assert.equal(evalRunTranscriptKey(prefix), `${prefix}transcript.md`);
    assert.equal(evalRunAsrResultKey(prefix), `${prefix}asr_result.json`);
  });
});
