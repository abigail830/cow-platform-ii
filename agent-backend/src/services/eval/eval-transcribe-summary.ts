import type { appEvalRunItems, appEvalRunVariants } from '../../db/index.ts';
import { evalItemDurationMs } from './eval-run-item-enrichment.ts';

export type TranscribeVariantSummary = {
  variant_id: string;
  pipeline_name: string;
  display_name: string;
  samples: number;
  audio_seconds: number;
  process_seconds: number;
  rtf: number;
  latency_avg_ms: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
};

export type TranscribeRunSummary = {
  by_variant: Record<string, TranscribeVariantSummary>;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1));
  return sorted[index]!;
}

function processSecondsFromItem(item: typeof appEvalRunItems.$inferSelect): number | null {
  const durationMs = evalItemDurationMs(item);
  if (durationMs == null) return null;
  return durationMs / 1000;
}

function audioDurationSecFromItem(item: typeof appEvalRunItems.$inferSelect): number | null {
  const metrics = item.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const raw = (metrics as Record<string, unknown>).audio_duration_sec;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function aggregateTranscribeSummaryMetrics(
  items: Array<typeof appEvalRunItems.$inferSelect>,
  variants: Array<typeof appEvalRunVariants.$inferSelect>,
): TranscribeRunSummary {
  const byVariant: Record<string, TranscribeVariantSummary> = {};

  for (const variant of variants) {
    const doneItems = items.filter(
      (item) => item.variantId === variant.id && item.stage === 'done',
    );
    if (doneItems.length === 0) continue;

    let audioSeconds = 0;
    let processSeconds = 0;
    const latenciesMs: number[] = [];

    for (const item of doneItems) {
      const audioSec = audioDurationSecFromItem(item);
      const processSec = processSecondsFromItem(item);
      if (audioSec == null || processSec == null) continue;
      audioSeconds += audioSec;
      processSeconds += processSec;
      latenciesMs.push(processSec * 1000);
    }

    if (audioSeconds <= 0 || latenciesMs.length === 0) continue;

    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const avgMs = latenciesMs.reduce((sum, value) => sum + value, 0) / latenciesMs.length;

    byVariant[variant.id] = {
      variant_id: variant.id,
      pipeline_name: variant.pipelineName,
      display_name: variant.displayName,
      samples: latenciesMs.length,
      audio_seconds: Math.round(audioSeconds * 1000) / 1000,
      process_seconds: Math.round(processSeconds * 1000) / 1000,
      rtf: Math.round((processSeconds / audioSeconds) * 10000) / 10000,
      latency_avg_ms: Math.round(avgMs),
      latency_p50_ms: Math.round(percentile(sorted, 0.5)),
      latency_p95_ms: Math.round(percentile(sorted, 0.95)),
    };
  }

  return { by_variant: byVariant };
}
