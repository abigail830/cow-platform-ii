import type { EvalRunCompareStatus, EvalRunItemStage, EvalRunStatus } from '../../db/index.ts';

export type EvalRunItemStageSnapshot = {
  stage: EvalRunItemStage | string;
};

export type EvalRunCompareStatusSnapshot = {
  status: EvalRunCompareStatus | string;
};

export type EvalRunCompletion = {
  status: EvalRunStatus;
  phase: 'done';
  completedRunItems: number;
  failedRunItems: number;
};

export type EvalRunCompareCompletion = {
  status: EvalRunStatus;
  phase: 'done';
  completedCompareItems: number;
  failedCompareItems: number;
};

const TERMINAL_ITEM_STAGES = new Set<EvalRunItemStage>(['done', 'failed', 'cancelled']);
const TERMINAL_COMPARE_STATUSES = new Set<EvalRunCompareStatus>(['done', 'failed']);

export function isTerminalEvalRunItemStage(stage: string): boolean {
  return TERMINAL_ITEM_STAGES.has(stage as EvalRunItemStage);
}

export function isTerminalEvalRunCompareStatus(status: string): boolean {
  return TERMINAL_COMPARE_STATUSES.has(status as EvalRunCompareStatus);
}

export function evalRunItemDispatchClaimed(metrics: unknown): boolean {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return false;
  return Boolean((metrics as Record<string, unknown>).dispatch_claimed_at);
}

export function hasEvalRunTranscribeSuccess(items: EvalRunItemStageSnapshot[]): boolean {
  return items.some((item) => item.stage === 'done');
}

/** Stop dispatching more workers once a job fails and none have succeeded yet. */
export function shouldContinueEvalRunDispatch(items: EvalRunItemStageSnapshot[]): boolean {
  if (hasEvalRunTranscribeSuccess(items)) return true;
  return !items.some(
    (item) => item.stage === 'failed' || item.stage === 'cancelled',
  );
}

export function computeEvalRunCompletion(items: EvalRunItemStageSnapshot[]): EvalRunCompletion | null {
  if (items.length === 0) return null;
  if (!items.every((item) => isTerminalEvalRunItemStage(item.stage))) {
    return null;
  }

  let completedRunItems = 0;
  let failedRunItems = 0;
  for (const item of items) {
    if (item.stage === 'done') completedRunItems += 1;
    else failedRunItems += 1;
  }

  let status: EvalRunStatus;
  if (completedRunItems === 0) {
    status = 'failed';
  } else if (failedRunItems > 0) {
    status = 'completed_with_errors';
  } else {
    status = 'completed';
  }

  return {
    status,
    phase: 'done',
    completedRunItems,
    failedRunItems,
  };
}

export function computeEvalRunCompareCompletion(
  comparisons: EvalRunCompareStatusSnapshot[],
): EvalRunCompareCompletion | null {
  if (comparisons.length === 0) return null;
  if (!comparisons.every((row) => isTerminalEvalRunCompareStatus(row.status))) {
    return null;
  }

  let completedCompareItems = 0;
  let failedCompareItems = 0;
  for (const row of comparisons) {
    if (row.status === 'done') completedCompareItems += 1;
    else failedCompareItems += 1;
  }

  let status: EvalRunStatus;
  if (completedCompareItems === 0) {
    status = 'failed';
  } else if (failedCompareItems > 0) {
    status = 'completed_with_errors';
  } else {
    status = 'completed';
  }

  return {
    status,
    phase: 'done',
    completedCompareItems,
    failedCompareItems,
  };
}
