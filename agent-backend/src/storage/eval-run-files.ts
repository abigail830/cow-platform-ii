import { validateKey } from './prefix-utils.ts';

export const EVAL_RUNS_PREFIX = 'eval-runs/';

export function buildEvalRunItemOutputPrefix(
  runId: string,
  variantId: string,
  itemId: string,
): string {
  const prefix = `${EVAL_RUNS_PREFIX}${runId}/variants/${variantId}/items/${itemId}/`;
  validateKey(prefix);
  return prefix;
}

export function evalRunTranscriptKey(outputPrefix: string): string {
  const key = `${outputPrefix.replace(/\/?$/, '/')}transcript.md`;
  validateKey(key);
  return key;
}

export function buildEvalRunComparisonKey(runId: string, datasetItemId: string): string {
  const key = `${EVAL_RUNS_PREFIX}${runId}/comparisons/${datasetItemId}.json`;
  validateKey(key);
  return key;
}

export function evalRunAsrResultKey(outputPrefix: string): string {
  const key = `${outputPrefix.replace(/\/?$/, '/')}asr_result.json`;
  validateKey(key);
  return key;
}
