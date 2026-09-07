import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  frozenWorkerDurationMs,
  parseEvalItemStartedAt,
  pipelineJobDurationMs,
  terminalTranscribeMetrics,
} from './eval-run-item-duration.ts';

describe('eval-run-item-duration', () => {
  it('prefers existing worker_duration_ms', () => {
    const ms = frozenWorkerDurationMs({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      metrics: { worker_duration_ms: 4200 },
    });
    assert.equal(ms, 4200);
  });

  it('uses pipeline job timestamps when metrics missing', () => {
    const ms = frozenWorkerDurationMs(
      {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        metrics: {},
      },
      {
        createdAt: new Date('2026-01-01T00:01:00Z'),
        updatedAt: new Date('2026-01-01T00:02:26Z'),
      },
    );
    assert.equal(ms, 86_000);
    assert.equal(pipelineJobDurationMs({ createdAt: new Date(0), updatedAt: new Date(1500) }), 1500);
  });

  it('parses dispatch_claimed_at for fallback duration start', () => {
    const started = parseEvalItemStartedAt({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      metrics: { dispatch_claimed_at: '2026-01-01T00:05:00.000Z' },
    });
    assert.equal(started.toISOString(), '2026-01-01T00:05:00.000Z');
    const finished = new Date('2026-01-01T00:06:26.000Z');
    assert.equal(
      frozenWorkerDurationMs(
        {
          createdAt: new Date('2026-01-01T00:00:00Z'),
          metrics: { dispatch_claimed_at: '2026-01-01T00:05:00.000Z' },
        },
        null,
        finished,
      ),
      86_000,
    );
  });

  it('terminalTranscribeMetrics freezes worker_duration_ms', () => {
    const metrics = terminalTranscribeMetrics(
      {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        metrics: {},
      },
      {
        createdAt: new Date('2026-01-01T00:01:00Z'),
        updatedAt: new Date('2026-01-01T00:02:00Z'),
      },
    );
    assert.equal(metrics.worker_duration_ms, 60_000);
  });
});
