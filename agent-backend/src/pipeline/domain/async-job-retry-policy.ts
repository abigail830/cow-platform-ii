import type { AsyncJobMetrics } from '../../infrastructure/db/index.ts';
import {
  inferFailedFromStage,
  type AsyncJobDomain,
} from './async-job-stages.ts';

export type RetryPolicy = {
  maxAttempts: number;
  autoRetry: boolean;
};

export function mergeAsyncJobMetrics(
  existing: AsyncJobMetrics | null | undefined,
  patch: Partial<AsyncJobMetrics> | null | undefined,
): AsyncJobMetrics | null {
  if (!patch || Object.keys(patch).length === 0) return existing ?? null;
  return { ...(existing ?? {}), ...patch };
}

export function getDefaultRetryPolicy(env: NodeJS.ProcessEnv = process.env): RetryPolicy {
  const maxRaw = Number(env.ASYNC_JOB_MAX_ATTEMPTS ?? '2');
  const maxAttempts = Number.isFinite(maxRaw) && maxRaw >= 1 ? Math.min(Math.trunc(maxRaw), 10) : 2;
  const autoRetry = env.ASYNC_JOB_AUTO_RETRY === 'true' || env.ASYNC_JOB_AUTO_RETRY === '1';
  return { maxAttempts, autoRetry };
}

export function getRetryAttempt(metrics: AsyncJobMetrics | null | undefined): number {
  const raw = metrics?.retry_attempt;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) return Math.trunc(raw);
  return 1;
}

export function canRetryJob(
  metrics: AsyncJobMetrics | null | undefined,
  policy: RetryPolicy,
): boolean {
  return getRetryAttempt(metrics) < policy.maxAttempts;
}

export function buildFailureMetrics(input: {
  existing: AsyncJobMetrics | null | undefined;
  failedFromStage: string;
  policy: RetryPolicy;
  errorCode?: string;
}): AsyncJobMetrics {
  const attempt = getRetryAttempt(input.existing);
  return mergeAsyncJobMetrics(input.existing, {
    retry_attempt: attempt,
    max_attempts: input.policy.maxAttempts,
    failed_from_stage: input.failedFromStage,
    last_error_code: input.errorCode,
  })!;
}

export function resolveAsyncJobPatchMetrics(input: {
  domain: AsyncJobDomain;
  previousStage: string;
  existingMetrics: AsyncJobMetrics | null | undefined;
  newStage?: string;
  metricsPatch?: Partial<AsyncJobMetrics> | Record<string, unknown> | null;
  policy?: RetryPolicy;
}): AsyncJobMetrics | null | undefined {
  if (input.newStage === 'failed') {
    const failedFromStage = inferFailedFromStage(
      input.domain,
      input.previousStage,
      input.existingMetrics,
    );
    const policy = input.policy ?? getDefaultRetryPolicy();
    const base = buildFailureMetrics({
      existing: input.existingMetrics,
      failedFromStage: failedFromStage ?? input.previousStage,
      policy,
    });
    if (input.metricsPatch === undefined) return base;
    return mergeAsyncJobMetrics(base, input.metricsPatch as Partial<AsyncJobMetrics>);
  }
  if (input.metricsPatch === undefined) return undefined;
  return mergeAsyncJobMetrics(
    input.existingMetrics,
    input.metricsPatch as Partial<AsyncJobMetrics>,
  );
}
