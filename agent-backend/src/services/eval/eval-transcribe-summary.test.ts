import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateTranscribeSummaryMetrics } from './eval-transcribe-summary.ts';

describe('aggregateTranscribeSummaryMetrics', () => {
  it('aggregates weighted RTF by variant', () => {
    const variants = [
      {
        id: 'v1',
        runId: 'run',
        pipelineConfigId: 'cfg',
        pipelineName: 'fun-asr',
        displayName: 'Fun-ASR',
        status: 'done',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as const;

    const items = [
      {
        id: 'i1',
        variantId: 'v1',
        stage: 'done',
        metrics: { audio_duration_sec: 10, asr_duration_ms: 5000 },
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:05Z'),
      },
      {
        id: 'i2',
        variantId: 'v1',
        stage: 'done',
        metrics: { audio_duration_sec: 20, asr_duration_ms: 10000 },
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:10Z'),
      },
    ] as const;

    const summary = aggregateTranscribeSummaryMetrics([...items], [...variants]);
    const row = summary.by_variant.v1;
    assert.ok(row);
    assert.equal(row.samples, 2);
    assert.equal(row.audio_seconds, 30);
    assert.equal(row.process_seconds, 15);
    assert.equal(row.rtf, 0.5);
  });
});
