/** Audio duration helpers for eval RTF (Real Time Factor) metrics. */

export function parseDatasetItemDurationSec(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const raw = record.duration_sec ?? record.duration_seconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return roundDurationSec(raw);
  }
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) return roundDurationSec(parsed);
  }
  return null;
}

export function roundDurationSec(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function computeRtf(processSeconds: number, audioDurationSec: number): number | null {
  if (!Number.isFinite(processSeconds) || !Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
    return null;
  }
  return Math.round((processSeconds / audioDurationSec) * 10000) / 10000;
}

export function computeRtfFromMs(durationMs: number, audioDurationSec: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return computeRtf(durationMs / 1000, audioDurationSec);
}

export function enrichTranscribeMetrics(
  metrics: Record<string, unknown>,
): Record<string, unknown> {
  const audioDurationSec = metrics.audio_duration_sec;
  if (typeof audioDurationSec !== 'number' || audioDurationSec <= 0) return metrics;

  const next = { ...metrics };
  if (typeof metrics.asr_duration_ms === 'number') {
    const rtf = computeRtfFromMs(metrics.asr_duration_ms, audioDurationSec);
    if (rtf != null) next.rtf_asr = rtf;
  }
  if (typeof metrics.worker_duration_ms === 'number') {
    const rtf = computeRtfFromMs(metrics.worker_duration_ms, audioDurationSec);
    if (rtf != null) next.rtf_worker = rtf;
  }
  return next;
}
