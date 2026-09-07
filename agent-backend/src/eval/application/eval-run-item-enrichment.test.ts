import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evalItemRtf } from './eval-run-item-enrichment.ts';

describe('evalItemRtf', () => {
  const baseItem = {
    stage: 'done',
    metrics: {
      audio_duration_sec: 10,
      asr_duration_ms: 4200,
      rtf_asr: 0.42,
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:10Z'),
  };

  it('returns stored RTF for audio runs', () => {
    assert.equal(evalItemRtf(baseItem, null, 'audio'), 0.42);
  });

  it('skips RTF for document runs', () => {
    assert.equal(evalItemRtf(baseItem, null, 'document'), null);
  });
});
