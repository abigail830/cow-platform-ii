export type PipelineWorkerMode = 'spawn' | 'github_actions';

/** How async pipeline jobs run openkms-cli: local subprocess vs GitHub Actions. */
export function resolvePipelineWorkerMode(
  env: NodeJS.ProcessEnv = process.env,
): PipelineWorkerMode {
  const raw = env.PIPELINE_WORKER?.trim().toLowerCase();
  if (raw === 'github_actions' || raw === 'github-actions' || raw === 'gha') {
    return 'github_actions';
  }
  if (raw === 'spawn' || raw === 'local') return 'spawn';
  // Vercel (and similar) cannot spawn sibling CLI processes.
  if (env.VERCEL || env.VERCEL_ENV) return 'github_actions';
  return 'spawn';
}

export function isServerlessRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL || env.VERCEL_ENV || env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Mark orphaned jobs failed on boot — unsafe on serverless (cold start every request). */
export function shouldRunPipelineStartupRecovery(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PIPELINE_STARTUP_RECOVERY?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  return !isServerlessRuntime(env);
}

/** In-process watchdog re-dispatches stuck jobs — needs a long-lived process. */
export function shouldRunPipelineWatchdog(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PIPELINE_POLL_SCHEDULER?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  return !isServerlessRuntime(env);
}
