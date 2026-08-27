import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { redactCliCommandSecrets } from '../../shared/model/model-cli-client.ts';
import { resolvePipelineWorkerMode, isServerlessRuntime } from '../pipeline/pipeline-worker-mode.ts';
import {
  resolveEvalPipelineGithubConfig,
  triggerEvalPipelineGithubActions,
} from './eval-pipeline-github-actions.ts';
import { updateEvalJudgeJob } from './eval-judge-jobs.ts';

function repoRootFromBackend(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

function resolveEvaluateCliBin(): string {
  const configured = process.env.EVALUATE_CLI_BIN?.trim();
  if (configured) return configured;
  const venvBin = path.join(repoRootFromBackend(), '..', 'evaluate-cli', '.venv', 'bin', 'evaluate-cli');
  if (existsSync(venvBin)) return venvBin;
  return 'uv run evaluate-cli';
}

function evaluateCliCwd(): string {
  return path.join(repoRootFromBackend(), '..', 'evaluate-cli');
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const activeEvalJudgeJobs = new Set<string>();

export function buildEvalJudgeWorkerCliArgs(jobId: string): string[] {
  return ['judge', 'run-async', '--job-id', jobId];
}

function resolveApiUrl(apiUrl?: string): string {
  return (
    apiUrl?.trim() ||
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

function spawnEvalJudgeCliLocal(args: string[], apiUrl?: string): Promise<void> {
  const jobId = args[args.indexOf('--job-id') + 1];
  if (jobId && activeEvalJudgeJobs.has(jobId)) {
    return Promise.resolve();
  }

  const cliBin = shellQuote(resolveEvaluateCliBin());
  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const command = `${cliBin} ${args.map(shellQuote).join(' ')}`;
  console.info(`[eval-judge] spawn ${redactCliCommandSecrets(command)}`);

  if (jobId) activeEvalJudgeJobs.add(jobId);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: evaluateCliCwd(),
      env: cliSpawnEnv(resolvedApiUrl),
    });

    let settled = false;
    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      handler();
    };

    child.on('error', (error) => {
      if (jobId) activeEvalJudgeJobs.delete(jobId);
      finish(() => reject(error));
    });
    child.on('spawn', () => finish(() => resolve()));
    child.on('close', (code) => {
      if (jobId) activeEvalJudgeJobs.delete(jobId);
      if (code !== 0) {
        console.error(`[eval-judge] CLI exited with code ${code}`);
      }
    });
  });
}

function isGithubWorkflowDispatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /dispatch failed \(404\)|Not Found|workflow.*not found/i.test(error.message);
}

async function dispatchGithubActionsEvalJudgeWorker(
  jobId: string,
  apiUrl?: string,
  options?: { skipMarkRunning?: boolean },
): Promise<void> {
  const baseConfig = resolveEvalPipelineGithubConfig();
  if (!baseConfig) {
    throw new Error(
      'PIPELINE_WORKER=github_actions requires GITHUB_PIPELINE_TOKEN (or GITHUB_TOKEN) ' +
        'and GITHUB_PIPELINE_REPOSITORY',
    );
  }

  if (!options?.skipMarkRunning) {
    await updateEvalJudgeJob(jobId, { status: 'running', errorMessage: null });
  }

  try {
    await triggerEvalPipelineGithubActions(
      { jobId, workerCliArgs: buildEvalJudgeWorkerCliArgs(jobId) },
      baseConfig,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch eval judge worker';
    await updateEvalJudgeJob(jobId, { status: 'failed', errorMessage: message });
    throw error;
  }
  console.info(
    `[eval-judge] dispatched GitHub Actions workflow=${baseConfig.workflowFile} ` +
      `repo=${baseConfig.repository} job=${jobId} api=${resolveApiUrl(apiUrl)}`,
  );
}

export async function spawnAsyncEvalJudgeWorker(
  jobId: string,
  apiUrl?: string,
  options?: { skipMarkRunning?: boolean },
): Promise<void> {
  if (activeEvalJudgeJobs.has(jobId)) {
    console.info(`[eval-judge] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  const args = buildEvalJudgeWorkerCliArgs(jobId);

  if (resolvePipelineWorkerMode() === 'github_actions') {
    activeEvalJudgeJobs.add(jobId);
    try {
      await dispatchGithubActionsEvalJudgeWorker(jobId, apiUrl, options);
    } catch (error) {
      if (!isServerlessRuntime() && isGithubWorkflowDispatchError(error)) {
        console.warn('[eval-judge] GitHub Actions unavailable; falling back to local evaluate-cli');
        await spawnEvalJudgeCliLocal(args, apiUrl);
        return;
      }
      throw error;
    } finally {
      activeEvalJudgeJobs.delete(jobId);
    }
    return;
  }

  await spawnEvalJudgeCliLocal(args, apiUrl);
}
