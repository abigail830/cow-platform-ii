export type KbPageIndexImportWorkerMode = 'spawn' | 'github_actions';

/** How PageIndex KB import jobs run openkms-cli (isolated from document parse worker). */
export function resolveKbPageIndexImportWorkerMode(
  env: NodeJS.ProcessEnv = process.env,
): KbPageIndexImportWorkerMode {
  const raw = env.KB_PAGEINDEX_IMPORT_WORKER?.trim().toLowerCase();
  if (raw === 'github_actions' || raw === 'github-actions' || raw === 'gha') {
    return 'github_actions';
  }
  if (raw === 'spawn' || raw === 'local') return 'spawn';

  if (env.VERCEL || env.VERCEL_ENV) return 'github_actions';
  return 'spawn';
}
