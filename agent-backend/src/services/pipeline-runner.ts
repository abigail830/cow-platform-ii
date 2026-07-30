import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { appDocuments, db } from '../db/index.ts';
import { fetchModelCliParams, formatExtractionCliArgs, formatVlmCliArgs } from '../shared/model-cli-client.ts';
import { getPipelineConfigById, getPipelineConfigByPipelineName } from '../shared/pipeline-config-store.ts';
import {
  defaultAsyncWorkerTemplate,
  normalizeAsyncWorkerCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
  renderCommandTemplate,
} from '../shared/pipeline-command-template.ts';
import { getChannelById } from './documents.ts';
import {
  ASYNC_PIPELINE_NAMES,
  createPipelineJob,
  pipelineProviderForName,
} from './pipeline-jobs.ts';
import { getS3Config } from '../storage/s3-config.ts';

const DEFAULT_COMMAND_TEMPLATE =
  'openkms-cli pipeline run --pipeline-name {pipeline_name} --input {input} --s3-prefix {s3_prefix} --document-id {document_id} --api-url {api_url}{vlm_args}{extraction_args}';

function repoRootFromBackend(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

function resolveCliBin(): string {
  const configured = process.env.OPENKMS_CLI_BIN?.trim();
  if (configured) return configured;
  return path.join(repoRootFromBackend(), '..', 'openkms-cli', '.venv', 'bin', 'openkms-cli');
}

function s3PrefixFromKey(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Prevent duplicate concurrent CLI invocations for the same async job. */
const activePipelineCliJobs = new Set<string>();

function extractJobIdFromCliArgs(args: string[]): string | undefined {
  const idx = args.indexOf('--job-id');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

/** Worker CLI reads credentials from openkms-cli/.env (cwd on spawn). Only override API URL. */
function cliSpawnEnv(apiUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENKMS_API_URL: apiUrl,
  };
}

export function spawnPipelineCli(args: string[], apiUrl?: string): void {
  const jobId = extractJobIdFromCliArgs(args);
  if (jobId && activePipelineCliJobs.has(jobId)) {
    console.info(`[pipeline] skip spawn (CLI already running): job ${jobId}`);
    return;
  }

  const cliBin = shellQuote(resolveCliBin());
  const resolvedApiUrl =
    apiUrl?.trim() ||
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;
  const command = `${cliBin} ${args.map(shellQuote).join(' ')}`;
  console.info(`[pipeline] spawn ${command}`);

  if (jobId) activePipelineCliJobs.add(jobId);

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
    if (jobId) activePipelineCliJobs.delete(jobId);
    console.error('[pipeline] spawn error:', error);
  });
  child.on('close', (code) => {
    if (jobId) activePipelineCliJobs.delete(jobId);
    if (code !== 0) {
      const detail = (stderr || stdout).trim();
      console.error(`[pipeline] CLI exited with code ${code}: ${detail.slice(0, 2000)}`);
    }
  });
}

export async function spawnAsyncPipelineWorker(
  jobId: string,
  pipelineName: string,
  apiUrl?: string,
): Promise<void> {
  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  const template = parseAsyncWorkerTemplate(pipeline?.commandTemplate ?? '', pipelineName);
  const args = normalizeAsyncWorkerCliArgs(
    pipelineTemplateToCliArgs(template, { job_id: jobId }),
  );
  if (args.length === 0) {
    spawnPipelineCli(['pipeline', 'run-async', '--job-id', jobId], apiUrl);
    return;
  }
  spawnPipelineCli(args, apiUrl);
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

async function executeLegacyPipelineRun(documentId: string): Promise<void> {
  const [doc] = await db.select().from(appDocuments).where(eq(appDocuments.id, documentId)).limit(1);
  if (!doc) throw new Error('Document not found');

  const channel = await getChannelById(doc.channelId);
  if (!channel?.pipelineId) throw new Error('Channel has no pipeline configured');

  const pipeline = await getPipelineConfigById(channel.pipelineId);
  if (!pipeline || !pipeline.isEnabled) throw new Error('Pipeline is not available');

  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  const inputUri = `s3://${s3.bucket}/${doc.s3Key}`;
  const s3Prefix = s3PrefixFromKey(doc.s3Key);
  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  let extractionArgs = '';
  if (channel.metadataExtractionModelId) {
    const extraction = await fetchModelCliParams(apiUrl, {
      modelId: channel.metadataExtractionModelId,
      apiType: 'chat-completions',
    });
    extractionArgs = formatExtractionCliArgs(extraction);
  }

  let vlmArgs = '';
  if (pipeline.pipelineName !== 'baidu-doc-parse' && pipeline.modelConfigId) {
    const vlm = await fetchModelCliParams(apiUrl, {
      modelId: pipeline.modelConfigId,
      apiType: 'vlm',
    });
    vlmArgs = formatVlmCliArgs(vlm);
  }

  const template = pipeline.commandTemplate?.trim() || DEFAULT_COMMAND_TEMPLATE;
  const rendered = renderCommandTemplate(template, {
    pipeline_name: pipeline.pipelineName,
    input: inputUri,
    s3_prefix: s3Prefix,
    document_id: doc.id,
    api_url: apiUrl,
    vlm_args: vlmArgs,
    extraction_args: extractionArgs,
  });
  const cliBin = shellQuote(resolveCliBin());
  const command = /^openkms-cli\b/.test(rendered.trim())
    ? rendered.replace(/^openkms-cli\b/, cliBin)
    : `${cliBin} ${rendered}`;

  console.info(`[pipeline] document=${documentId} command=${command}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: path.join(repoRootFromBackend(), '..', 'openkms-cli'),
      env: cliSpawnEnv(apiUrl),
    });

    let stderr = '';
    let stdout = '';
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const detail = (stderr || stdout).trim();
        reject(new Error(detail || `openkms-cli exited with code ${code}`));
      }
    });
  });
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

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  let extractionArgs = '';
  if (channel.metadataExtractionModelId) {
    const extraction = await fetchModelCliParams(apiUrl, {
      modelId: channel.metadataExtractionModelId,
      apiType: 'chat-completions',
    });
    extractionArgs = formatExtractionCliArgs(extraction);
  }

  const job = await createPipelineJob({
    documentId: doc.id,
    pipelineName: pipeline.pipelineName,
    provider,
    extractionArgs: extractionArgs || null,
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

  if (doc.status === 'running') throw new Error('Pipeline is already running for this document');

  await updateDocumentStatus(documentId, 'running');

  if (ASYNC_PIPELINE_NAMES.has(pipeline.pipelineName)) {
    const { jobId } = await startAsyncPipelineJob(documentId);
    return { status: 'running', job_id: jobId };
  }

  void executeLegacyPipelineRun(documentId)
    .then(async () => {
      await updateDocumentStatus(documentId, 'completed');
    })
    .catch(async (error) => {
      console.error(`Pipeline failed for document ${documentId}:`, error);
      await updateDocumentStatus(documentId, 'failed');
    });

  return { status: 'running' };
}
