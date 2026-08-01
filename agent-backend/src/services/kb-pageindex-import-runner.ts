import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveKbPageIndexImportGithubConfig,
  triggerKbPageIndexImportGithubActions,
} from './kb-pageindex-import-github-actions.ts';
import { resolveKbPageIndexImportWorkerMode } from './kb-pageindex-import-worker-mode.ts';
import { getKbImportJobById, updateKbImportJob } from './knowledge-bases.ts';

const activeKbImportJobs = new Set<string>();

function repoRootFromBackend(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

function resolveCliBin(): string {
  const configured = process.env.OPENKMS_CLI_BIN?.trim();
  if (configured) return configured;
  return path.join(repoRootFromBackend(), '..', 'openkms-cli', '.venv', 'bin', 'openkms-cli');
}

function resolveApiUrl(): string {
  return (
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`
  );
}

function cliSpawnEnv(apiUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENKMS_API_URL: apiUrl,
  };
}

function spawnKbPageIndexImportCliLocal(jobId: string, apiUrl?: string): void {
  const resolvedApiUrl = apiUrl ?? resolveApiUrl();
  const child = spawn(
    resolveCliBin(),
    ['kb', 'pageindex-import', '--job-id', jobId, '--api-url', resolvedApiUrl],
    {
      cwd: path.join(repoRootFromBackend(), '..', 'openkms-cli'),
      env: cliSpawnEnv(resolvedApiUrl),
      stdio: 'inherit',
    },
  );

  child.on('error', async (error) => {
    console.error(`[kb-pageindex-import] spawn failed for job ${jobId}:`, error);
    activeKbImportJobs.delete(jobId);
    await updateKbImportJob(jobId, {
      status: 'failed',
      errorMessage: error.message,
    });
  });

  child.on('close', async (code) => {
    activeKbImportJobs.delete(jobId);
    if (code !== 0) {
      console.error(`[kb-pageindex-import] job ${jobId} exited with code ${code}`);
      const job = await getKbImportJobById(jobId);
      if (job && job.status === 'running') {
        await updateKbImportJob(jobId, {
          status: 'failed',
          errorMessage: `openkms-cli exited with code ${code}`,
        });
      }
    }
  });
}

async function dispatchKbPageIndexImportGithub(jobId: string): Promise<void> {
  const config = resolveKbPageIndexImportGithubConfig();
  if (!config) {
    throw new Error(
      'KB_PAGEINDEX_IMPORT_WORKER=github_actions requires GITHUB_PIPELINE_TOKEN (or GITHUB_TOKEN) ' +
        'and GITHUB_PIPELINE_REPOSITORY (owner/repo).',
    );
  }
  await triggerKbPageIndexImportGithubActions({ jobId }, config);
}

/**
 * Run PageIndex KB import worker (isolated from document parse pipeline).
 */
export async function spawnKbPageIndexImportWorker(jobId: string, apiUrl?: string): Promise<void> {
  if (activeKbImportJobs.has(jobId)) {
    console.info(`[kb-pageindex-import] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  await updateKbImportJob(jobId, { status: 'running' });

  if (resolveKbPageIndexImportWorkerMode() === 'github_actions') {
    activeKbImportJobs.add(jobId);
    try {
      await dispatchKbPageIndexImportGithub(jobId);
    } finally {
      activeKbImportJobs.delete(jobId);
    }
    return;
  }

  activeKbImportJobs.add(jobId);
  spawnKbPageIndexImportCliLocal(jobId, apiUrl);
}
