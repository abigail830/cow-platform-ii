import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { appDocuments, db } from '../../db/index.ts';
import { redactCliCommandSecrets } from '../../shared/model/model-cli-client.ts';
import { getPipelineConfigById, getPipelineConfigByPipelineName } from '../../shared/pipeline/pipeline-config-store.ts';
import {
  normalizeAsyncWorkerCliArgs,
  pageIndexStrategyFromCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
} from '../../shared/pipeline/pipeline-command-template.ts';
import { getChannelById } from '../documents/documents.ts';
import {
  resolveGithubActionsConfig,
  triggerGithubActionsPipeline,
} from './pipeline-github-actions.ts';
import { resolvePipelineWorkerMode } from './pipeline-worker-mode.ts';
import {
  ASYNC_PIPELINE_NAMES,
  createPipelineJob,
  isDocumentAsyncPipelineName,
  pipelineProviderForName,
} from './pipeline-jobs.ts';

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

/** Prevent duplicate concurrent dispatches for the same async job. */
const activePipelineJobs = new Set<string>();

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

async function buildAsyncWorkerCliArgs(
  jobId: string,
  pipelineName: string,
): Promise<string[]> {
  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const template = parseAsyncWorkerTemplate(pipeline?.commandTemplate ?? '', pipelineName);
  const args = normalizeAsyncWorkerCliArgs(
    pipelineTemplateToCliArgs(template, { job_id: jobId }),
  );
  if (args.length === 0) {
    return ['pipeline', 'run-async', '--job-id', jobId];
  }
  return args;
}

async function dispatchGithubActionsWorker(
  jobId: string,
  pipelineName: string,
): Promise<void> {
  const config = resolveGithubActionsConfig();
  if (!config) {
    throw new Error(
      'PIPELINE_WORKER=github_actions requires GITHUB_PIPELINE_TOKEN (or GITHUB_TOKEN) ' +
        'and GITHUB_PIPELINE_REPOSITORY (e.g. abigail830/cow-platform-ii)',
    );
  }
  const args = await buildAsyncWorkerCliArgs(jobId, pipelineName);
  const pageIndexStrategy = pageIndexStrategyFromCliArgs(args);
  await triggerGithubActionsPipeline({ jobId, pageIndexStrategy }, config);
  console.info(
    `[pipeline] dispatched GitHub Actions workflow=${config.workflowFile} ` +
      `repo=${config.repository} job=${jobId}`,
  );
}

function spawnPipelineCliLocal(args: string[], apiUrl?: string): void {
  const jobId = extractJobIdFromCliArgs(args);
  if (jobId && activePipelineJobs.has(jobId)) {
    console.info(`[pipeline] skip spawn (worker already active): job ${jobId}`);
    return;
  }

  const cliBin = shellQuote(resolveCliBin());
  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const command = `${cliBin} ${args.map(shellQuote).join(' ')}`;
  console.info(`[pipeline] spawn ${redactCliCommandSecrets(command)}`);

  if (jobId) activePipelineJobs.add(jobId);

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
    if (jobId) activePipelineJobs.delete(jobId);
    console.error('[pipeline] spawn error:', error);
  });
  child.on('close', (code) => {
    if (jobId) activePipelineJobs.delete(jobId);
    if (code !== 0) {
      const detail = (stderr || stdout).trim();
      console.error(`[pipeline] CLI exited with code ${code}: ${detail.slice(0, 2000)}`);
    }
  });
}

/** Worker CLI reads credentials from openkms-cli/.env (cwd on spawn). Only override API URL. */
function cliSpawnEnv(apiUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENKMS_API_URL: apiUrl,
  };
}

/** Local subprocess dispatch (development / long-running Node host). */
export function spawnPipelineCli(args: string[], apiUrl?: string): void {
  spawnPipelineCliLocal(args, apiUrl);
}

/**
 * Run async pipeline worker: local spawn or GitHub Actions (see PIPELINE_WORKER / VERCEL).
 */
export async function spawnAsyncPipelineWorker(
  jobId: string,
  pipelineName: string,
  apiUrl?: string,
): Promise<void> {
  if (activePipelineJobs.has(jobId)) {
    console.info(`[pipeline] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  if (resolvePipelineWorkerMode() === 'github_actions') {
    activePipelineJobs.add(jobId);
    try {
      await dispatchGithubActionsWorker(jobId, pipelineName);
    } finally {
      activePipelineJobs.delete(jobId);
    }
    return;
  }

  const args = await buildAsyncWorkerCliArgs(jobId, pipelineName);
  spawnPipelineCliLocal(args, apiUrl);
}

/** @deprecated Use spawnAsyncPipelineWorker */
export async function spawnAsyncPipelineFinalize(
  jobId: string,
  pipelineName: string,
  apiUrl?: string,
): Promise<void> {
  return spawnAsyncPipelineWorker(jobId, pipelineName, apiUrl);
}

export async function updateDocumentStatus(
  documentId: string,
  status: 'uploaded' | 'running' | 'completed' | 'failed',
): Promise<void> {
  await db
    .update(appDocuments)
    .set({ status, updatedAt: new Date() })
    .where(eq(appDocuments.id, documentId));
}

async function startAsyncPipelineJob(documentId: string): Promise<{ jobId: string }> {
  const [doc] = await db.select().from(appDocuments).where(eq(appDocuments.id, documentId)).limit(1);
  if (!doc) throw new Error('Document not found');

  const channel = await getChannelById(doc.channelId);
  if (!channel?.pipelineId) throw new Error('Channel has no pipeline configured');

  const pipeline = await getPipelineConfigById(channel.pipelineId);
  if (!pipeline || !pipeline.isEnabled) throw new Error('Pipeline is not available');

  const provider = pipelineProviderForName(pipeline.pipelineName);
  if (!provider) throw new Error(`Unsupported async pipeline: ${pipeline.pipelineName}`);

  const apiUrl = resolveApiUrl();

  const job = await createPipelineJob({
    documentId: doc.id,
    pipelineName: pipeline.pipelineName,
    provider,
    configYaml: pipeline.configYaml,
  });

  await spawnAsyncPipelineWorker(job.id, pipeline.pipelineName, apiUrl);
  return { jobId: job.id };
}

export async function startDocumentPipeline(documentId: string): Promise<{ status: string; job_id?: string }> {
  const [doc] = await db.select().from(appDocuments).where(eq(appDocuments.id, documentId)).limit(1);
  if (!doc) throw new Error('Document not found');

  const channel = await getChannelById(doc.channelId);
  if (!channel?.pipelineId) throw new Error('Channel has no pipeline configured');

  const pipeline = await getPipelineConfigById(channel.pipelineId);
  if (!pipeline) throw new Error('Pipeline is not available');

  if (!isDocumentAsyncPipelineName(pipeline.pipelineName)) {
    throw new Error(
      `Channel pipeline must be an async document parse pipeline ` +
        `(${[...ASYNC_PIPELINE_NAMES].join(', ')}). Got: ${pipeline.pipelineName}`,
    );
  }

  if (doc.status === 'running') throw new Error('Pipeline is already running for this document');

  await updateDocumentStatus(documentId, 'running');

  const { jobId } = await startAsyncPipelineJob(documentId);
  return { status: 'running', job_id: jobId };
}
