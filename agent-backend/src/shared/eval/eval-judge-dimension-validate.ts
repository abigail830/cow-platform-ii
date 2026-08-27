import type { EvalJudgeDimensionRecord } from '../../db/schema.ts';
import type { EvalJudgeDimensionDefinition } from '../../services/eval/eval-judge-dimensions.ts';
import { normalizeEvalJudgeGevalCriteria } from './eval-judge-criteria.ts';

const DIMENSION_ID_RE = /^[a-z][a-z0-9_]*$/;

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
    if (!criteria) throw new Error(`Dimension ${id}: criteria (evaluation prompt) is required`);
    if (scope !== 'variant' && scope !== 'pairwise') {
      throw new Error(`Dimension ${id}: scope must be variant or pairwise`);
    }
    if (kind !== 'geval_score' && kind !== 'geval_winner') {
      throw new Error(`Dimension ${id}: kind must be geval_score or geval_winner`);
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Dimension ${id}: weight must be a positive number`);
    }

    const evaluationSteps = normalizeEvaluationSteps(dimension.evaluation_steps, id);

    return {
      id,
      label,
      scope,
      kind,
      weight,
      criteria: normalizeEvalJudgeGevalCriteria(criteria, kind),
      ...(evaluationSteps ? { evaluation_steps: evaluationSteps } : {}),
    };
  });
}
