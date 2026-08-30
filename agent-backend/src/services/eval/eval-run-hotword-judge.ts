import type { EvalRunAsrHotword } from '../../db/schema.ts';
import type { EvalJudgeDimensionDefinition } from './eval-judge-dimensions.ts';
import { normalizeEvalRunHotwords } from './eval-run-hotwords.ts';

export const HOTWORD_RECALL_DIMENSION_ID = 'hotword_recall';
export const HOTWORD_PRECISION_DIMENSION_ID = 'hotword_precision';
export const HOTWORD_F1_DIMENSION_ID = 'hotword_f1';

export const HOTWORD_JUDGE_DIMENSIONS: EvalJudgeDimensionDefinition[] = [
  {
    id: HOTWORD_RECALL_DIMENSION_ID,
    label: 'Hotword Recall',
    scope: 'variant_vs_gt',
    kind: 'hotword_recall_score',
    weight: 1,
    criteria:
      'Deterministic hotword recall: matched term occurrences divided by reference occurrences. ' +
      'Case-insensitive; punctuation, spaces, and hyphens ignored (reference/scripts algorithm).',
    pass_threshold: '>=90%',
  },
  {
    id: HOTWORD_PRECISION_DIMENSION_ID,
    label: 'Hotword Precision',
    scope: 'variant_vs_gt',
    kind: 'hotword_precision_score',
    weight: 1,
    criteria:
      'Deterministic hotword precision: matched term occurrences divided by transcript occurrences.',
    pass_threshold: '>=90%',
  },
  {
    id: HOTWORD_F1_DIMENSION_ID,
    label: 'Hotword F1',
    scope: 'variant_vs_gt',
    kind: 'hotword_f1_score',
    weight: 1,
    criteria: 'Harmonic mean of hotword precision and recall.',
    pass_threshold: '>=90%',
  },
];

export function isHotwordEvalEnabled(snapshot: EvalRunAsrHotword[] | null | undefined): boolean {
  return normalizeEvalRunHotwords(snapshot).length > 0;
}

export function parseTargetHotwordsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>).target_hotwords;
  if (!Array.isArray(raw)) return [];
  const terms = raw
    .map((term) => (typeof term === 'string' ? term.trim() : ''))
    .filter(Boolean);
  return [...new Set(terms)];
}

export function resolveEvalHotwordTerms(
  snapshot: EvalRunAsrHotword[] | null | undefined,
  metadata: unknown,
): string[] {
  const fromMetadata = parseTargetHotwordsFromMetadata(metadata);
  if (fromMetadata.length > 0) return fromMetadata;
  return normalizeEvalRunHotwords(snapshot).map((row) => row.text);
}

export async function buildJudgeDimensionsSnapshot(
  scenarioId: string,
  attempt: { asrHotwordsSnapshot: EvalRunAsrHotword[] | null | undefined },
): Promise<EvalJudgeDimensionDefinition[]> {
  const { snapshotEvalJudgeDimensions } = await import('./eval-judge-dimensions.ts');
  const base = await snapshotEvalJudgeDimensions(scenarioId);
  if (!isHotwordEvalEnabled(attempt.asrHotwordsSnapshot)) return base;
  return [...base, ...HOTWORD_JUDGE_DIMENSIONS];
}
