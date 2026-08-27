import type { EvalJudgeDimensionKind } from '../../services/eval/eval-judge-dimensions.ts';

/** Score dimensions should describe an integer 0–10 rubric in criteria (see Judge Dimensions admin). */
export const GEVAL_INTEGER_SCALE_HINT =
  'Use an integer score from 0 to 10 (inclusive) where 0 is worst and 10 is best. Do not use a 0–1 scale or decimals.';

const ZERO_TO_ONE_PATTERNS: RegExp[] = [
  /Score from 0 \([^)]+\) to 1 \([^)]+\)\.?/gi,
  /Score from 0 to 1\.?/gi,
  /Score 0 if ([^,]+),\s*1 if ([^.]+)\.?/gi,
  /\b0–1 scale\b/gi,
  /\b0-1 scale\b/gi,
];

function mentionsZeroToTenScale(text: string): boolean {
  return /\b0\s*[–-]\s*10\b|\b0 to 10\b/i.test(text);
}

function stripZeroToOneScalePhrases(text: string): string {
  let result = text;
  for (const pattern of ZERO_TO_ONE_PATTERNS) {
    if (pattern.source.includes('Score 0 if')) {
      result = result.replace(pattern, 'Use integer 0–10 where 0 means $1 and 10 means $2.');
    } else {
      result = result.replace(pattern, '');
    }
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

export function normalizeEvalJudgeGevalCriteria(
  criteria: string,
  kind: EvalJudgeDimensionKind,
): string {
  const trimmed = criteria.trim();
  if (kind === 'geval_winner') return trimmed;
  if (!trimmed) return `${GEVAL_INTEGER_SCALE_HINT} Explain your score in 1–2 sentences.`;

  let text = stripZeroToOneScalePhrases(trimmed);

  if (!mentionsZeroToTenScale(text)) {
    text = `${text} ${GEVAL_INTEGER_SCALE_HINT}`.trim();
  }

  if (!/Explain your (score|decision)/i.test(text)) {
    text = `${text} Explain your score in 1–2 sentences.`.trim();
  }

  return text;
}

export function normalizeEvalJudgeDimensions<
  T extends { kind: EvalJudgeDimensionKind; criteria: string },
>(dimensions: T[]): T[] {
  return dimensions.map((dimension) => ({
    ...dimension,
    criteria: normalizeEvalJudgeGevalCriteria(dimension.criteria, dimension.kind),
  }));
}
