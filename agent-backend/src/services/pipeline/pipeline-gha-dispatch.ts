/** Skip duplicate workflow_dispatch for the same job (callbacks + double-clicks on serverless). */
export function shouldSkipDuplicateGhaPipelineDispatch(
  job: {
    stage: string;
    createdAt: Date;
    updatedAt: Date;
  },
  now = Date.now(),
): boolean {
  if (job.stage !== 'submitted') return false;
  const dispatchedAt = job.updatedAt.getTime();
  const createdAt = job.createdAt.getTime();
  if (dispatchedAt <= createdAt + 2000) return false;
  return now - dispatchedAt < 10 * 60 * 1000;
}
