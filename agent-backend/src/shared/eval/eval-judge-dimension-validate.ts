import type { EvalJudgeDimensionRecord } from '../../db/schema.ts';
import type { EvalJudgeDimensionDefinition } from '../../services/eval/eval-judge-dimensions.ts';
import { validatePassThresholdForDimension } from './judge-threshold.ts';

const DIMENSION_ID_RE = /^[a-z][a-z0-9_]*$/;

function defaultErrorRateCriteria(kind: 'cer_score' | 'wer_score'): string {
  if (kind === 'wer_score') {
    return (
      'Deterministic Word Error Rate (WER) between EXPECTED_OUTPUT and ACTUAL_OUTPUT. ' +
      'English words and digits are one token each; each CJK character is one token ' +
      '(supports mixed Chinese/English). Punctuation and spaces are ignored; lower is better.'
    );
  }
  return (
    'Deterministic Character Error Rate (CER) between EXPECTED_OUTPUT and ACTUAL_OUTPUT. ' +
    'Compares lowercase alphanumeric and CJK characters only (supports mixed Chinese/English). ' +
    'Punctuation and spaces are ignored; lower is better.'
  );
}

export function normalizeEvaluationSteps(raw: unknown, dimensionId: string): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`Dimension ${dimensionId}: evaluation_steps must be an array of strings`);
  }
  const steps = raw
    .map((step, index) => {
      if (typeof step !== 'string') {
        throw new Error(`Dimension ${dimensionId}: evaluation_steps[${index}] must be a string`);
      }
      return step.trim();
    })
    .filter(Boolean);
  if (steps.length === 0) return undefined;
  if (steps.length > 20) {
    throw new Error(`Dimension ${dimensionId}: evaluation_steps must have at most 20 items`);
  }
  return steps;
}

export function validateJudgeDimensions(
  dimensions: EvalJudgeDimensionRecord[],
): EvalJudgeDimensionDefinition[] {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error('At least one dimension is required');
  }

  const seen = new Set<string>();
  return dimensions.map((dimension, index) => {
    const id = String(dimension.id ?? '').trim();
    const label = String(dimension.label ?? '').trim();
    const criteria = String(dimension.criteria ?? '').trim();
    const scope = dimension.scope;
    const kind = dimension.kind;
    const weight = Number(dimension.weight);

    if (!id || !DIMENSION_ID_RE.test(id)) {
      throw new Error(`Dimension ${index + 1}: id must be a lowercase slug`);
    }
    if (seen.has(id)) throw new Error(`Duplicate dimension id: ${id}`);
    seen.add(id);
    if (!label) throw new Error(`Dimension ${id}: label is required`);
    if (scope !== 'variant' && scope !== 'pairwise' && scope !== 'variant_vs_gt') {
      throw new Error(`Dimension ${id}: scope must be variant, pairwise, or variant_vs_gt`);
    }
    if (
      kind !== 'geval_score' &&
      kind !== 'geval_winner' &&
      kind !== 'cer_score' &&
      kind !== 'wer_score'
    ) {
      throw new Error(
        `Dimension ${id}: kind must be geval_score, geval_winner, cer_score, or wer_score`,
      );
    }
    const resolvedCriteria =
      criteria ||
      (kind === 'cer_score' || kind === 'wer_score' ? defaultErrorRateCriteria(kind) : '');
    if (!resolvedCriteria) {
      throw new Error(`Dimension ${id}: criteria (evaluation prompt) is required`);
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Dimension ${id}: weight must be a positive number`);
    }

    const evaluationSteps = normalizeEvaluationSteps(dimension.evaluation_steps, id);
    const passThreshold = validatePassThresholdForDimension(
      typeof dimension.pass_threshold === 'string' ? dimension.pass_threshold : undefined,
      { id, kind },
    );

    return {
      id,
      label,
      scope,
      kind,
      weight,
      criteria: resolvedCriteria,
      ...(evaluationSteps ? { evaluation_steps: evaluationSteps } : {}),
      ...(passThreshold ? { pass_threshold: passThreshold } : {}),
    };
  });
}
