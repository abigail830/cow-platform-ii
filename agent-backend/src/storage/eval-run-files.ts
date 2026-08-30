import { validateKey } from './prefix-utils.ts';

export const EVAL_RUNS_PREFIX = 'eval-runs/';

export function buildEvalRunItemOutputPrefix(
  runId: string,
  attemptId: string,
  variantId: string,
  datasetItemId: string,
): string {
  const prefix = `${EVAL_RUNS_PREFIX}${runId}/attempts/${attemptId}/variants/${variantId}/items/${datasetItemId}/`;
  validateKey(prefix);
  return prefix;
}

export function evalRunTranscriptKey(outputPrefix: string): string {
  const key = `${outputPrefix.replace(/\/?$/, '/')}transcript.md`;
  validateKey(key);
  return key;
}

export function buildEvalRunComparisonKey(
  runId: string,
  attemptId: string,
  datasetItemId: string,
): string {
  const key = `${EVAL_RUNS_PREFIX}${runId}/attempts/${attemptId}/comparisons/${datasetItemId}.json`;
  validateKey(key);
  return key;
}

export function buildEvalRunJudgeResultKey(
  runId: string,
  attemptId: string,
  datasetItemId: string,
): string {
  const key = `${EVAL_RUNS_PREFIX}${runId}/attempts/${attemptId}/judgments/${datasetItemId}.json`;
  validateKey(key);
  return key;
}

export function evalRunAsrResultKey(outputPrefix: string): string {
  const key = `${outputPrefix.replace(/\/?$/, '/')}asr_result.json`;
  validateKey(key);
  return key;
}

/** Document parse pipeline writes markdown.md (stored in transcript_s3_key for judge reuse). */
export function evalRunDocumentMarkdownKey(outputPrefix: string): string {
  const key = `${outputPrefix.replace(/\/?$/, '/')}markdown.md`;
  validateKey(key);
  return key;
}

/** Document parse pipeline writes result.json (stored in asr_result_s3_key). */
export function evalRunDocumentParseResultKey(outputPrefix: string): string {
  const key = `${outputPrefix.replace(/\/?$/, '/')}result.json`;
  validateKey(key);
  return key;
}
