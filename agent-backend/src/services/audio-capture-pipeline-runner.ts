import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { appAudioCaptures, db } from '../db/index.ts';
import { redactCliCommandSecrets } from '../shared/model-cli-client.ts';
import { getPipelineConfigByPipelineName, getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import {
  normalizeAsyncWorkerCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
} from '../shared/pipeline-command-template.ts';
import { resolvePipelineWorkerMode } from './pipeline-worker-mode.ts';
import {
  CAPTURE_POST_PROCESS_PIPELINE_NAME,
  createCapturePipelineJob,
} from './audio-capture-pipeline-jobs.ts';
import { isCapturePostProcessPipelineName } from './capture-post-process-pipeline-names.ts';
import { getAudioChannelById } from './audios.ts';
import {
  DEFAULT_CAPTURE_POST_PROCESS_WORKFLOW_FILE,
  resolveCapturePipelineGithubConfig,
  triggerCapturePipelineGithubActions,
} from './audio-capture-pipeline-github-actions.ts';

const activeCaptureJobs = new Set<string>();

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

export function defaultCapturePipelineWorkflowFile(_pipelineName: string): string {
  return (
    process.env.GITHUB_AUDIO_CAPTURE_PIPELINE_WORKFLOW?.trim() ||
    DEFAULT_CAPTURE_POST_PROCESS_WORKFLOW_FILE
  );
}

async function buildCaptureWorkerCliArgs(jobId: string, pipelineName: string): Promise<string[]> {
  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const template = parseAsyncWorkerTemplate(pipeline?.commandTemplate ?? '', pipelineName);
  const args = normalizeAsyncWorkerCliArgs(
    pipelineTemplateToCliArgs(template, { job_id: jobId }),
  );
  if (args.length === 0) {
    return ['audio-capture', 'post-process', '--job-id', jobId];
  }
  return args;
}

function cliSpawnEnv(apiUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENKMS_API_URL: apiUrl,
  };
}

function spawnCaptureCliLocal(args: string[], apiUrl?: string): void {
  const jobId = extractJobIdFromCliArgs(args);
  if (jobId && activeCaptureJobs.has(jobId)) {
    console.info(`[capture-post-process] skip spawn (worker already active): job ${jobId}`);
    return;
  }

  const cliBin = shellQuote(resolveCliBin());
  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const command = `${cliBin} ${args.map(shellQuote).join(' ')}`;
  console.info(`[capture-post-process] spawn ${redactCliCommandSecrets(command)}`);

  if (jobId) activeCaptureJobs.add(jobId);

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
    if (jobId) activeCaptureJobs.delete(jobId);
    console.error('[capture-post-process] spawn error:', error);
  });
  child.on('close', (code) => {
    if (jobId) activeCaptureJobs.delete(jobId);
    if (code !== 0) {
      const detail = (stderr || stdout).trim();
      console.error(`[capture-post-process] CLI exited with code ${code}: ${detail.slice(0, 2000)}`);
    }
  });
}

async function dispatchGithubActionsCaptureWorker(jobId: string, pipelineName: string): Promise<void> {
  const baseConfig = resolveCapturePipelineGithubConfig();
  if (!baseConfig) {
    throw new Error(
      'PIPELINE_WORKER=github_actions requires GITHUB_PIPELINE_TOKEN (or GITHUB_TOKEN) ' +
        'and GITHUB_PIPELINE_REPOSITORY',
    );
  }

  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const workflowFile =
    pipeline?.workflowFile?.trim() ||
    process.env.GITHUB_AUDIO_CAPTURE_PIPELINE_WORKFLOW?.trim() ||
    defaultCapturePipelineWorkflowFile(pipelineName);

  const workerCliArgs = await buildCaptureWorkerCliArgs(jobId, pipelineName);

  await triggerCapturePipelineGithubActions(
    { jobId, workerCliArgs },
    { ...baseConfig, workflowFile },
  );
  console.info(
    `[capture-post-process] dispatched GitHub Actions workflow=${workflowFile} ` +
      `repo=${baseConfig.repository} job=${jobId}`,
  );
}

export async function spawnCapturePostProcessWorker(
  jobId: string,
  pipelineName: string,
  apiUrl?: string,
): Promise<void> {
  if (activeCaptureJobs.has(jobId)) {
    console.info(`[capture-post-process] skip dispatch (worker already active): job ${jobId}`);
    return;
  }

  if (resolvePipelineWorkerMode() === 'github_actions') {
    activeCaptureJobs.add(jobId);
    try {
      await dispatchGithubActionsCaptureWorker(jobId, pipelineName);
    } finally {
      activeCaptureJobs.delete(jobId);
    }
    return;
  }

  const args = await buildCaptureWorkerCliArgs(jobId, pipelineName);
  spawnCaptureCliLocal(args, apiUrl);
}

export async function resolveCapturePostProcessPipelineForChannel(channelId: string) {
  const channel = await getAudioChannelById(channelId);
  if (channel?.postProcessPipelineId) {
    const configured = await getPipelineConfigById(channel.postProcessPipelineId);
    if (configured?.isEnabled && isCapturePostProcessPipelineName(configured.pipelineName)) {
      return configured;
    }
  }
  return getPipelineConfigByPipelineName(CAPTURE_POST_PROCESS_PIPELINE_NAME);
}

export async function startCapturePostProcess(
  captureId: string,
): Promise<{ status: string; job_id: string }> {
  const [capture] = await db
    .select()
    .from(appAudioCaptures)
    .where(eq(appAudioCaptures.id, captureId))
    .limit(1);
  if (!capture) throw new Error('Capture not found');

  if (capture.status === 'post_processing') {
    throw new Error('Post-process pipeline is already running for this capture');
  }

  const { assessCaptureReadiness } = await import('./capture-post-process-trigger.ts');
  const readiness = await assessCaptureReadiness(captureId);
  if (readiness.reason === 'no_segments') {
    throw new Error('Capture has no segments');
  }
  if (readiness.reason === 'segments_incomplete') {
    throw new Error('Not all segments are transcribed yet');
  }
  if (readiness.reason === 'post_process_active') {
    throw new Error('Post-process pipeline is already running for this capture');
  }
  // already_done: allow manual re-run — creates a fresh capture pipeline job.

  const pipeline = await resolveCapturePostProcessPipelineForChannel(capture.channelId);
  if (!pipeline?.isEnabled) {
    throw new Error('Capture post-process pipeline is not available');
  }

  const job = await createCapturePipelineJob({
    captureId,
    pipelineName: pipeline.pipelineName,
    configYaml: pipeline.configYaml,
  });

  await db
    .update(appAudioCaptures)
    .set({ status: 'post_processing', updatedAt: new Date() })
    .where(eq(appAudioCaptures.id, captureId));

  await spawnCapturePostProcessWorker(job.id, job.pipelineName);
  return { status: 'post_processing', job_id: job.id };
}
