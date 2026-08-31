/** Frozen per-item transcribe duration for eval run items (not live updatedAt − createdAt). */

export function parseEvalItemStartedAt(item: {
  createdAt: Date;
  metrics: Record<string, unknown> | null | undefined;
}): Date {
  const metrics = item.metrics;
  if (metrics && typeof metrics === 'object' && !Array.isArray(metrics)) {
    for (const key of ['transcribe_started_at', 'dispatch_claimed_at'] as const) {
      const raw = metrics[key];
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = new Date(raw);
        if (!Number.isFinite(parsed.getTime())) continue;
        return parsed;
      }
    }
  }
  return item.createdAt;
}

export function existingWorkerDurationMs(
  metrics: Record<string, unknown> | null | undefined,
): number | null {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const raw = metrics.worker_duration_ms ?? metrics.asr_duration_ms;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

export function pipelineJobDurationMs(job: { createdAt: Date; updatedAt: Date }): number {
  const ms = job.updatedAt.getTime() - job.createdAt.getTime();
  return ms >= 0 ? ms : 0;
}

export function frozenWorkerDurationMs(
  item: {
    createdAt: Date;
    metrics: Record<string, unknown> | null | undefined;
  },
  job?: { createdAt: Date; updatedAt: Date } | null,
  finishedAt: Date = new Date(),
): number {
  const existing = existingWorkerDurationMs(item.metrics);
  if (existing != null) return existing;
  if (job) return pipelineJobDurationMs(job);
  const started = parseEvalItemStartedAt(item);
  const ms = finishedAt.getTime() - started.getTime();
  return ms >= 0 ? ms : 0;
}

export function terminalTranscribeMetrics(
  item: {
    createdAt: Date;
    metrics: Record<string, unknown> | null | undefined;
  },
  job?: { createdAt: Date; updatedAt: Date } | null,
  finishedAt: Date = new Date(),
): Record<string, unknown> {
  return {
    worker_duration_ms: frozenWorkerDurationMs(item, job, finishedAt),
  };
}
