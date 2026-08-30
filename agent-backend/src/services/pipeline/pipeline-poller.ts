import { eq, inArray } from 'drizzle-orm';
import { appDocuments, appPipelineJobs, db, PIPELINE_JOB_STAGES, type PipelineJobStage } from '../../db/index.ts';
import { markDocumentForJobStage, updatePipelineJob } from './pipeline-jobs.ts';
import { spawnAsyncPipelineWorker } from './pipeline-runner.ts';
import {
  resolvePipelineWorkerMode,
  shouldRunPipelineStartupRecovery,
  shouldRunPipelineWatchdog,
} from './pipeline-worker-mode.ts';

const ACTIVE_JOB_STAGES = PIPELINE_JOB_STAGES.filter(
  (stage): stage is PipelineJobStage => stage !== 'done' && stage !== 'failed',
);

const STARTUP_RECOVERY_MESSAGE =
  'Pipeline interrupted because the server restarted. Re-run pipeline from the document list.';

/** Re-spawn CLI if a job is stuck (CLI crash / missed spawn / metadata interrupted). */
const WATCHDOG_INTERVAL_MS = Number(process.env.PIPELINE_JOB_WATCHDOG_INTERVAL_MS ?? 60_000);
const SUBMIT_STALE_MS = Number(process.env.PIPELINE_SUBMIT_STALE_MS ?? 15 * 60 * 1000);
const PARSED_STALE_MS = Number(process.env.PIPELINE_PARSED_STALE_MS ?? 5 * 60 * 1000);

let watchdogTimer: ReturnType<typeof setInterval> | undefined;

/**
 * After a process restart in-memory CLI workers are gone. Mark non-terminal jobs and
 * running documents as failed so the UI does not show stale "Running" forever.
 */
export async function recoverOrphanedPipelineWorkOnStartup(): Promise<void> {
  if (!shouldRunPipelineStartupRecovery()) {
    console.info('[pipeline] skip startup recovery (serverless or PIPELINE_STARTUP_RECOVERY=false)');
    return;
  }
  const orphanedJobs = await db
    .select()
    .from(appPipelineJobs)
    .where(inArray(appPipelineJobs.stage, [...ACTIVE_JOB_STAGES]));

  for (const job of orphanedJobs) {
    await updatePipelineJob(job.id, {
      stage: 'failed',
      errorMessage: STARTUP_RECOVERY_MESSAGE,
    });
    await markDocumentForJobStage(job.documentId, 'failed');
  }

  const runningDocs = await db
    .select({ id: appDocuments.id })
    .from(appDocuments)
    .where(eq(appDocuments.status, 'running'));

  if (runningDocs.length > 0) {
    await db
      .update(appDocuments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(appDocuments.status, 'running'));
  }

  if (orphanedJobs.length > 0 || runningDocs.length > 0) {
    console.info(
      `[pipeline] startup recovery: marked ${orphanedJobs.length} orphaned job(s) and ` +
        `${runningDocs.length} running document(s) as failed`,
    );
  }
}

export function startPipelinePollScheduler(): void {
  if (!shouldRunPipelineWatchdog()) {
    console.info('[pipeline] skip job watchdog (serverless or PIPELINE_POLL_SCHEDULER=false)');
    return;
  }
  if (watchdogTimer) return;

  watchdogTimer = setInterval(() => {
    void watchdogStuckJobs();
  }, WATCHDOG_INTERVAL_MS);

  console.info(`[pipeline] job watchdog started (interval=${WATCHDOG_INTERVAL_MS}ms)`);
}

async function watchdogStuckJobs(): Promise<void> {
  try {
    const workerMode = resolvePipelineWorkerMode();
    const submittedRows = await db
      .select()
      .from(appPipelineJobs)
      .where(eq(appPipelineJobs.stage, 'submitted'));

    for (const job of submittedRows) {
      const isCloudProvider = job.provider === 'baidu' || job.provider === 'aliyun';
      const ageMs = Date.now() - new Date(job.createdAt).getTime();

      if (isCloudProvider) {
        const externalId = job.externalJobId?.trim();
        if (!externalId && ageMs > SUBMIT_STALE_MS) {
          const message =
            'Submit never received external_job_id from the cloud provider (timed out). ' +
            'Check CLI logs and cloud credentials in openkms-cli/.env.';
          await updatePipelineJob(job.id, { stage: 'failed', errorMessage: message });
          await markDocumentForJobStage(job.documentId, 'failed');
          console.error(`[pipeline] job ${job.id} timed out without external_job_id`);
          continue;
        }

        // GHA workers run in CI — do not re-dispatch every watchdog tick (queues duplicate runs).
        if (workerMode === 'github_actions') continue;

        await spawnAsyncPipelineWorker(job.id, job.pipelineName);
        continue;
      }

      // paddle: sync VLM in one run-async — re-spawn if worker died mid-parse
      if (job.provider === 'paddle' && ageMs > SUBMIT_STALE_MS) {
        if (workerMode === 'github_actions') continue;
        console.info(`[pipeline] re-spawn paddle VLM worker for job ${job.id} (stale ${ageMs}ms)`);
        await spawnAsyncPipelineWorker(job.id, job.pipelineName);
      }
    }

    if (workerMode === 'github_actions') return;

    const parsedRows = await db
      .select()
      .from(appPipelineJobs)
      .where(eq(appPipelineJobs.stage, 'parsed'));

    for (const job of parsedRows) {
      // Metadata step is decided by worker config YAML (job snapshot or CLI default).
      // Re-spawn if still stuck in parsed (worker may have crashed mid-metadata).
      const staleMs = Date.now() - new Date(job.updatedAt).getTime();
      if (staleMs < PARSED_STALE_MS) continue;
      console.info(`[pipeline] re-spawn metadata resume for job ${job.id} (parsed stale ${staleMs}ms)`);
      await spawnAsyncPipelineWorker(job.id, job.pipelineName);
    }
  } catch (error) {
    console.error('[pipeline] job watchdog query failed:', error);
  }
}
