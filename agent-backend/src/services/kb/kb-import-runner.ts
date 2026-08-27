import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_KB_FAQ_EXTRACT_COMMAND_TEMPLATE,
  DEFAULT_KB_FAQ_INDEX_COMMAND_TEMPLATE,
  DEFAULT_KB_PAGEINDEX_IMPORT_COMMAND_TEMPLATE,
  DEFAULT_KB_RAG_INDEX_COMMAND_TEMPLATE,
  FAQ_KB_EXTRACT_PIPELINE_NAME,
  FAQ_KB_INDEX_PIPELINE_NAME,
  RAG_KB_PIPELINE_NAME,
  defaultKbImportWorkflowFile,
} from '../../shared/pipeline/pipeline-catalog.ts';
import { buildWorkerCliArgsFromTemplate } from '../../shared/pipeline/pipeline-command-template.ts';
import {
  resolveKbImportPipelineForJob,
  updateKbImportJob,
  getKbImportJobById,
} from './knowledge-bases.ts';
import { resolveKbImportGithubConfig, triggerKbImportGithubActions } from './kb-import-github-actions.ts';
import { resolveKbImportWorkerMode } from './kb-import-worker-mode.ts';

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

async function buildKbImportCliArgs(jobId: string): Promise<string[]> {
  const { pipeline } = await resolveKbImportPipelineForJob(jobId);
  let fallback = DEFAULT_KB_PAGEINDEX_IMPORT_COMMAND_TEMPLATE;
  if (pipeline.pipelineName === RAG_KB_PIPELINE_NAME) {
    fallback = DEFAULT_KB_RAG_INDEX_COMMAND_TEMPLATE;
  } else if (pipeline.pipelineName === FAQ_KB_INDEX_PIPELINE_NAME) {
    fallback = DEFAULT_KB_FAQ_INDEX_COMMAND_TEMPLATE;
  } else if (pipeline.pipelineName === FAQ_KB_EXTRACT_PIPELINE_NAME) {
    fallback = DEFAULT_KB_FAQ_EXTRACT_COMMAND_TEMPLATE;
  }
  return buildWorkerCliArgsFromTemplate(pipeline.commandTemplate, fallback, { job_id: jobId });
}

function spawnKbImportCliLocal(jobId: string, cliArgs: string[], apiUrl?: string): void {
  const resolvedApiUrl = apiUrl ?? resolveApiUrl();
  const args = [...cliArgs];
  if (!args.includes('--api-url')) {
    args.push('--api-url', resolvedApiUrl);
  }

  const child = spawn(resolveCliBin(), args, {
    cwd: path.join(repoRootFromBackend(), '..', 'openkms-cli'),
    env: cliSpawnEnv(resolvedApiUrl),
    stdio: 'inherit',
  });

  child.on('error', async (error) => {
    console.error(`[kb-import] spawn failed for job ${jobId}:`, error);
    activeKbImportJobs.delete(jobId);
    await updateKbImportJob(jobId, {
      status: 'failed',
      errorMessage: error.message,
    });
  });

  child.on('close', async (code) => {
    activeKbImportJobs.delete(jobId);
    if (code !== 0) {
      console.error(`[kb-import] job ${jobId} exited with code ${code}`);
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

async function dispatchKbImportGithub(jobId: string): Promise<void> {
  const { pipeline } = await resolveKbImportPipelineForJob(jobId);
  const baseConfig = resolveKbImportGithubConfig();
  if (!baseConfig) {
    throw new Error(
      'KB_IMPORT_WORKER=github_actions requires GITHUB_PIPELINE_TOKEN (or GITHUB_TOKEN) ' +
        'and GITHUB_PIPELINE_REPOSITORY (owner/repo).',
    );
  }

  const workflowFile =
    pipeline.workflowFile?.trim() ||
    process.env.GITHUB_KB_IMPORT_WORKFLOW?.trim() ||
    defaultKbImportWorkflowFile(pipeline.pipelineName);

  const workerCliArgs = await buildKbImportCliArgs(jobId);

  await triggerKbImportGithubActions(
    { jobId, workerCliArgs },
    { ...baseConfig, workflowFile },
  );
}

async function assertKbImportJobReady(jobId: string): Promise<void> {
  const job = await getKbImportJobById(jobId);
  if (!job) throw new Error('KB import job not found');
  // faq_extract prompts/model come from job.config_yaml or CLI packaged default — no agent snapshot.
}

/**
 * Run KB import/index worker using the job's linked pipeline template.
 */
export async function spawnKbImportWorker(jobId: string, apiUrl?: string): Promise<void> {
  if (activeKbImportJobs.has(jobId)) {
    console.info(`[kb-import] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  try {
    await assertKbImportJobReady(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job is not ready to run';
    await updateKbImportJob(jobId, { status: 'failed', errorMessage: message });
    throw error;
  }

  await updateKbImportJob(jobId, { status: 'running' });

  if (resolveKbImportWorkerMode() === 'github_actions') {
    activeKbImportJobs.add(jobId);
    try {
      await dispatchKbImportGithub(jobId);
    } finally {
      activeKbImportJobs.delete(jobId);
    }
    return;
  }

  activeKbImportJobs.add(jobId);
  const cliArgs = await buildKbImportCliArgs(jobId);
  spawnKbImportCliLocal(jobId, cliArgs, apiUrl);
}
