import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeRtfFromMs,
  enrichTranscribeMetrics,
  parseDatasetItemDurationSec,
} from './eval-audio-duration.ts';

describe('parseDatasetItemDurationSec', () => {
  it('reads duration_sec and duration_seconds aliases', () => {
    assert.equal(parseDatasetItemDurationSec({ duration_sec: 12.3456 }), 12.346);
    assert.equal(parseDatasetItemDurationSec({ duration_seconds: '8.5' }), 8.5);
  });

  it('returns null for invalid values', () => {
    assert.equal(parseDatasetItemDurationSec(null), null);
    assert.equal(parseDatasetItemDurationSec({ duration_sec: 0 }), null);
  });
});

describe('computeRtfFromMs', () => {
  it('computes process/audio ratio', () => {
    assert.equal(computeRtfFromMs(5000, 10), 0.5);
  });
});

describe('enrichTranscribeMetrics', () => {
  it('adds rtf fields when audio duration is known', () => {
    const enriched = enrichTranscribeMetrics({
      audio_duration_sec: 10,
      asr_duration_ms: 4200,
      worker_duration_ms: 5000,
    });
    assert.equal(enriched.rtf_asr, 0.42);
    assert.equal(enriched.rtf_worker, 0.5);
  });
});
