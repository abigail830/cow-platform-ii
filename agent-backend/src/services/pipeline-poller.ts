import { eq, inArray } from 'drizzle-orm';
import { appDocuments, appPipelineJobs, db, PIPELINE_JOB_STAGES, type PipelineJobStage } from '../db/index.ts';
import { markDocumentForJobStage, updatePipelineJob } from './pipeline-jobs.ts';
import { spawnAsyncPipelineWorker } from './pipeline-runner.ts';

const ACTIVE_JOB_STAGES = PIPELINE_JOB_STAGES.filter(
  (stage): stage is PipelineJobStage => stage !== 'done' && stage !== 'failed',
);

const STARTUP_RECOVERY_MESSAGE =
  'Pipeline interrupted because the server restarted. Re-run pipeline from the document list.';

/** Re-spawn CLI if a job is stuck in submitted (CLI crash / missed spawn). Not the poll loop. */
const WATCHDOG_INTERVAL_MS = Number(process.env.PIPELINE_JOB_WATCHDOG_INTERVAL_MS ?? 60_000);
const SUBMIT_STALE_MS = Number(process.env.PIPELINE_SUBMIT_STALE_MS ?? 15 * 60 * 1000);

let watchdogTimer: ReturnType<typeof setInterval> | undefined;

/**
 * After a process restart in-memory CLI workers are gone. Mark non-terminal jobs and
 * running documents as failed so the UI does not show stale "Running" forever.
 */
export async function recoverOrphanedPipelineWorkOnStartup(): Promise<void> {
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
  if (process.env.PIPELINE_POLL_SCHEDULER === 'false') return;
  if (watchdogTimer) return;

  watchdogTimer = setInterval(() => {
    void watchdogSubmittedJobs();
  }, WATCHDOG_INTERVAL_MS);

  console.info(`[pipeline] job watchdog started (interval=${WATCHDOG_INTERVAL_MS}ms)`);
}

async function watchdogSubmittedJobs(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(appPipelineJobs)
      .where(eq(appPipelineJobs.stage, 'submitted'));

    for (const job of rows) {
      if (job.provider !== 'baidu' && job.provider !== 'aliyun') continue;

      const externalId = job.externalJobId?.trim();
      const ageMs = Date.now() - new Date(job.createdAt).getTime();
      if (!externalId && ageMs > SUBMIT_STALE_MS) {
        const message =
          'Submit never received external_job_id from the cloud provider (timed out). ' +
          'Check CLI logs and cloud credentials in openkms-cli/.env.';
        await updatePipelineJob(job.id, { stage: 'failed', errorMessage: message });
        await markDocumentForJobStage(job.documentId, 'failed');
        console.error(`[pipeline] job ${job.id} timed out without external_job_id`);
        continue;
      }

      await spawnAsyncPipelineWorker(job.id, job.pipelineName);
    }
  } catch (error) {
    console.error('[pipeline] job watchdog query failed:', error);
  }
}
