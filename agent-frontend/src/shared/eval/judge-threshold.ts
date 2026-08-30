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

export function evaluatePassThreshold(
  score: number,
  thresholdExpr: string | null | undefined,
  context: JudgeThresholdScoreContext,
): boolean | null {
  const parsed = parsePassThresholdExpression(thresholdExpr ?? '');
  if (!parsed) return null;

  if (context.kind === 'geval_winner') {
    return null;
  }

  let compareValue: number;
  let thresholdValue = parsed.value;

  if (isErrorRateKind(context)) {
    compareValue = score * 100;
    if (!parsed.isPercent) {
      compareValue = score;
      thresholdValue = parsed.value;
    }
  } else if (isHotwordKind(context)) {
    if (!parsed.isPercent) {
      return null;
    }
    compareValue = score * 100;
  } else if (isDeepevalRagKind(context)) {
    if (!parsed.isPercent) {
      return null;
    }
    compareValue = score * 100;
  } else {
    if (parsed.isPercent) {
      return null;
    }
    compareValue = judgeScoreCompareValue(score, context);
  }

  return compareValues(compareValue, parsed.op, thresholdValue);
}
