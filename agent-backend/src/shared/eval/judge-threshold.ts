/** Pass/fail threshold expressions for eval judge dimension scores. */

export type PassThresholdOp = '<' | '<=' | '>' | '>=' | '=' | '==';

export type ParsedPassThreshold = {
  op: PassThresholdOp;
  value: number;
  isPercent: boolean;
};

export type JudgeThresholdScoreContext = {
  kind?: string;
  scoreMax?: number;
  lowerIsBetter?: boolean;
};

const PASS_THRESHOLD_RE = /^(<=|>=|==|=|<|>)\s*([\d.]+)\s*(%)?\s*$/;

export function parsePassThresholdExpression(expr: string): ParsedPassThreshold | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const match = trimmed.match(PASS_THRESHOLD_RE);
  if (!match) {
    throw new Error(
      `Invalid pass threshold "${expr}". Use expressions like >=7, <0.3%, or <=13.3%.`,
    );
  }
  const value = Number(match[2]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid pass threshold value in "${expr}"`);
  }
  const op = match[1] as PassThresholdOp;
  return { op, value, isPercent: match[3] === '%' };
}

function isErrorRateKind(context: JudgeThresholdScoreContext): boolean {
  const kind = context.kind;
  return kind === 'cer_score' || kind === 'wer_score' || Boolean(context.lowerIsBetter);
}

function isHotwordKind(context: JudgeThresholdScoreContext): boolean {
  const kind = context.kind;
  return (
    kind === 'hotword_recall_score' ||
    kind === 'hotword_precision_score' ||
    kind === 'hotword_f1_score'
  );
}

function isDeepevalRagKind(context: JudgeThresholdScoreContext): boolean {
  const kind = context.kind;
  return (
    kind === 'faithfulness_score' ||
    kind === 'contextual_recall_score' ||
    kind === 'contextual_precision_score'
  );
}

function isFractionPercentKind(context: JudgeThresholdScoreContext): boolean {
  return isErrorRateKind(context) || isHotwordKind(context) || isDeepevalRagKind(context);
}

/** Numeric value used when evaluating a threshold expression (matches UI display scale). */
export function judgeScoreCompareValue(
  score: number,
  context: JudgeThresholdScoreContext,
): number {
  if (isFractionPercentKind(context)) {
    return score * 100;
  }
  const max = context.scoreMax ?? 10;
  return context.scoreMax != null ? score : score * max;
}

function compareValues(left: number, op: PassThresholdOp, right: number): boolean {
  switch (op) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '=':
    case '==':
      return left === right;
    default:
      return false;
  }
}

/**
 * Returns true when the score passes the threshold, false when it fails.
 * Missing/blank threshold → pass (null = no threshold configured).
 */
export function evaluatePassThreshold(
  score: number,
  thresholdExpr: string | null | undefined,
  context: JudgeThresholdScoreContext,
): boolean | null {
  const parsed = parsePassThresholdExpression(thresholdExpr ?? '');
  if (!parsed) return null;

  if (context.kind === 'geval_winner') {
    throw new Error('Pass threshold is not supported for winner (pairwise) dimensions');
  }

  let compareValue: number;
  let thresholdValue = parsed.value;

  if (isErrorRateKind(context)) {
    compareValue = score * 100;
    if (!parsed.isPercent) {
      // Raw fraction scale (0–1), e.g. <0.003 for 0.3%.
      compareValue = score;
      thresholdValue = parsed.value;
    }
  } else if (isHotwordKind(context)) {
    if (!parsed.isPercent) {
      throw new Error('Hotword pass threshold requires % suffix, e.g. >=90%');
    }
    compareValue = score * 100;
  } else if (isDeepevalRagKind(context)) {
    if (!parsed.isPercent) {
      throw new Error('DeepEval RAG pass threshold requires % suffix, e.g. >=70%');
    }
    compareValue = score * 100;
  } else {
    if (parsed.isPercent) {
      throw new Error(
        'Pass threshold with % is only supported for CER/WER, hotword, and DeepEval RAG dimensions',
      );
    }
    compareValue = judgeScoreCompareValue(score, context);
  }

  return compareValues(compareValue, parsed.op, thresholdValue);
}

export function validatePassThresholdForDimension(
  thresholdExpr: string | null | undefined,
  dimension: { id: string; kind: string },
): string | undefined {
  const raw = thresholdExpr?.trim();
  if (!raw) return undefined;
  if (dimension.kind === 'geval_winner') {
    throw new Error(`Dimension ${dimension.id}: pass threshold is not supported for winner kind`);
  }
  parsePassThresholdExpression(raw);
  if (dimension.kind === 'geval_score' && raw.includes('%')) {
    throw new Error(`Dimension ${dimension.id}: use 0–10 expressions like >=7 for GEval scores`);
  }
  if (
    (dimension.kind === 'faithfulness_score' ||
      dimension.kind === 'contextual_recall_score' ||
      dimension.kind === 'contextual_precision_score') &&
    raw.includes('%') === false
  ) {
    throw new Error(
      `Dimension ${dimension.id}: DeepEval RAG pass threshold requires % suffix, e.g. >=70%`,
    );
  }
  return raw;
}
