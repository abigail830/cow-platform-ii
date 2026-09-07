import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { redactCliCommandSecrets } from '../../model-config/infrastructure/model-cli-client.ts';
import { getPipelineConfigByPipelineName } from '../../pipeline/infrastructure/pipeline-config-store.ts';
import {
  normalizeAsyncWorkerCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
} from '../../pipeline/domain/pipeline-command-template.ts';
import {
  resolveAudioPipelineGithubConfig,
  triggerAudioPipelineGithubActions,
} from './audio-pipeline-github-actions.ts';
import { resolvePipelineWorkerMode } from '../../pipeline/application/pipeline-worker-mode.ts';
import {
  defaultAudioPipelineWorkflowFile,
} from '../application/audio-pipeline-jobs.ts';

function repoRootFromBackend(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

function resolveCliBin(): string {
  const configured = process.env.OPENKMS_CLI_BIN?.trim();
  if (configured) return configured;
  return path.join(repoRootFromBackend(), '..', 'openkms-cli', '.venv', 'bin', 'openkms-cli');
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const activeAudioPipelineJobs = new Set<string>();

function extractJobIdFromCliArgs(args: string[]): string | undefined {
  const idx = args.indexOf('--job-id');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

function resolveApiUrl(apiUrl?: string): string {
  return (
    apiUrl?.trim() ||
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`
  );
}

async function buildAudioWorkerCliArgs(jobId: string, pipelineName: string): Promise<string[]> {
  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const template = parseAsyncWorkerTemplate(pipeline?.commandTemplate ?? '', pipelineName);
  const args = normalizeAsyncWorkerCliArgs(
    pipelineTemplateToCliArgs(template, { job_id: jobId }),
  );
  if (args.length === 0) {
    return ['audio-pipeline', 'run-async', '--job-id', jobId];
  }
  return args;
}

function cliSpawnEnv(apiUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENKMS_API_URL: apiUrl,
  };
}

function spawnAudioPipelineCliLocal(args: string[], apiUrl?: string): void {
  const jobId = extractJobIdFromCliArgs(args);
  if (jobId && activeAudioPipelineJobs.has(jobId)) {
    console.info(`[audio-pipeline] skip spawn (worker already active): job ${jobId}`);
    return;
  }

  const cliBin = shellQuote(resolveCliBin());
  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const command = `${cliBin} ${args.map(shellQuote).join(' ')}`;
  console.info(`[audio-pipeline] spawn ${redactCliCommandSecrets(command)}`);

  if (jobId) activeAudioPipelineJobs.add(jobId);

  const child = spawn(command, {
    shell: true,
    cwd: path.join(repoRootFromBackend(), '..', 'openkms-cli'),
    env: cliSpawnEnv(resolvedApiUrl),
  });

  let stderr = '';
  let stdout = '';
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += String(chunk);
  });
  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  child.on('error', (error) => {
    if (jobId) activeAudioPipelineJobs.delete(jobId);
    console.error('[audio-pipeline] spawn error:', error);
  });
  child.on('close', (code) => {
    if (jobId) activeAudioPipelineJobs.delete(jobId);
    if (code !== 0) {
      const detail = (stderr || stdout).trim();
      console.error(`[audio-pipeline] CLI exited with code ${code}: ${detail.slice(0, 2000)}`);
    }
  });
}

async function dispatchGithubActionsAudioWorker(jobId: string, pipelineName: string): Promise<void> {
  const baseConfig = resolveAudioPipelineGithubConfig();
  if (!baseConfig) {
    throw new Error(
      'PIPELINE_WORKER=github_actions requires GITHUB_PIPELINE_TOKEN (or GITHUB_TOKEN) ' +
        'and GITHUB_PIPELINE_REPOSITORY',
    );
  }

  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const workflowFile =
    pipeline?.workflowFile?.trim() ||
    process.env.GITHUB_AUDIO_PIPELINE_WORKFLOW?.trim() ||
    defaultAudioPipelineWorkflowFile(pipelineName);

  const workerCliArgs = await buildAudioWorkerCliArgs(jobId, pipelineName);

  await triggerAudioPipelineGithubActions(
    { jobId, workerCliArgs },
    { ...baseConfig, workflowFile },
  );
  console.info(
    `[audio-pipeline] dispatched GitHub Actions workflow=${workflowFile} ` +
      `repo=${baseConfig.repository} job=${jobId}`,
  );
}

export async function spawnAsyncAudioPipelineWorker(
  jobId: string,
  pipelineName: string,
  apiUrl?: string,
): Promise<void> {
  if (activeAudioPipelineJobs.has(jobId)) {
    console.info(`[audio-pipeline] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  if (resolvePipelineWorkerMode() === 'github_actions') {
    activeAudioPipelineJobs.add(jobId);
    try {
      await dispatchGithubActionsAudioWorker(jobId, pipelineName);
    } finally {
      activeAudioPipelineJobs.delete(jobId);
    }
    return;
  }

  const args = await buildAudioWorkerCliArgs(jobId, pipelineName);
  spawnAudioPipelineCliLocal(args, apiUrl);
}
