import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { redactCliCommandSecrets } from '../shared/model-cli-client.ts';
import { getPipelineConfigByPipelineName } from '../shared/pipeline-config-store.ts';
import {
  normalizeAsyncWorkerCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
  mapOpenkmsAudioCliArgsToEvaluateCli,
} from '../shared/pipeline-command-template.ts';
import { resolvePipelineWorkerMode, isServerlessRuntime } from './pipeline-worker-mode.ts';
import {
  resolveAudioPipelineGithubConfig,
  triggerAudioPipelineGithubActions,
} from './audio-pipeline-github-actions.ts';

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

function isGithubWorkflowDispatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /dispatch failed \(404\)|Not Found|workflow.*not found/i.test(error.message);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const activeEvalPipelineJobs = new Set<string>();

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

function cliSpawnEnv(apiUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENKMS_API_URL: apiUrl,
  };
}

export async function buildEvalWorkerCliArgs(jobId: string, pipelineName: string): Promise<string[]> {
  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const template = parseAsyncWorkerTemplate(pipeline?.commandTemplate ?? '', pipelineName);
  const args = mapOpenkmsAudioCliArgsToEvaluateCli(
    normalizeAsyncWorkerCliArgs(pipelineTemplateToCliArgs(template, { job_id: jobId })),
  );
  if (args.length === 0 || args[0] !== 'pipeline') {
    return ['pipeline', 'run-async', '--job-id', jobId];
  }
  return args;
}

function spawnEvalPipelineCliLocal(args: string[], apiUrl?: string): Promise<void> {
  const jobId = extractJobIdFromCliArgs(args);
  if (jobId && activeEvalPipelineJobs.has(jobId)) {
    return Promise.resolve();
  }

  const cliBin = shellQuote(resolveEvaluateCliBin());
  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const command = `${cliBin} ${args.map(shellQuote).join(' ')}`;
  console.info(`[eval-pipeline] spawn ${redactCliCommandSecrets(command)}`);

  if (jobId) activeEvalPipelineJobs.add(jobId);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: evaluateCliCwd(),
      env: cliSpawnEnv(resolvedApiUrl),
    });

    let stderr = '';
    let stdout = '';
    let settled = false;

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      handler();
    };

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.on('error', (error) => {
      if (jobId) activeEvalPipelineJobs.delete(jobId);
      finish(() => reject(error));
    });
    child.on('spawn', () => {
      finish(() => resolve());
    });
    child.on('close', (code) => {
      if (jobId) activeEvalPipelineJobs.delete(jobId);
      if (code !== 0) {
        const detail = (stderr || stdout).trim();
        console.error(`[eval-pipeline] CLI exited with code ${code}: ${detail.slice(0, 2000)}`);
      }
    });
  });
}

async function dispatchGithubActionsEvalWorker(jobId: string, pipelineName: string): Promise<void> {
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
    process.env.GITHUB_EVAL_PIPELINE_WORKFLOW?.trim() ||
    'evaluate-pipeline.yml';

  const workerCliArgs = await buildEvalWorkerCliArgs(jobId, pipelineName);

  await triggerAudioPipelineGithubActions(
    { jobId, workerCliArgs },
    { ...baseConfig, workflowFile },
  );
  console.info(
    `[eval-pipeline] dispatched GitHub Actions workflow=${workflowFile} ` +
      `repo=${baseConfig.repository} job=${jobId}`,
  );
}

export async function spawnAsyncEvalPipelineWorker(
  jobId: string,
  pipelineName: string,
  apiUrl?: string,
): Promise<void> {
  if (activeEvalPipelineJobs.has(jobId)) {
    console.info(`[eval-pipeline] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  if (resolvePipelineWorkerMode() === 'github_actions') {
    activeEvalPipelineJobs.add(jobId);
    try {
      await dispatchGithubActionsEvalWorker(jobId, pipelineName);
    } catch (error) {
      if (!isServerlessRuntime() && isGithubWorkflowDispatchError(error)) {
        console.warn(
          `[eval-pipeline] GitHub Actions unavailable (${error instanceof Error ? error.message : error}); ` +
            'falling back to local evaluate-cli',
        );
        const args = await buildEvalWorkerCliArgs(jobId, pipelineName);
        await spawnEvalPipelineCliLocal(args, apiUrl);
        return;
      }
      throw error;
    } finally {
      activeEvalPipelineJobs.delete(jobId);
    }
    return;
  }

  const args = await buildEvalWorkerCliArgs(jobId, pipelineName);
  await spawnEvalPipelineCliLocal(args, apiUrl);
}

export const EVAL_RUN_DEFAULT_DISPATCH_CONCURRENCY = 5;

export async function dispatchEvalRunItemsWithConcurrency(
  items: Array<{ id: string; pipelineName: string }>,
  concurrency = EVAL_RUN_DEFAULT_DISPATCH_CONCURRENCY,
): Promise<{ failures: string[] }> {
  const limit = Math.max(1, concurrency);
  let index = 0;
  const failures: string[] = [];

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      try {
        await spawnAsyncEvalPipelineWorker(current.id, current.pipelineName);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        console.error(`[eval-pipeline] dispatch failed for job ${current.id}: ${message}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return { failures };
}
