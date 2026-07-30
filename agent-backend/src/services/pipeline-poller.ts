import { eq } from 'drizzle-orm';
import { appPipelineJobs, db } from '../db/index.ts';
import { markDocumentForJobStage, updatePipelineJob } from './pipeline-jobs.ts';
import { spawnAsyncPipelineWorker } from './pipeline-runner.ts';

/** Re-spawn CLI if a job is stuck in submitted (CLI crash / missed spawn). Not the poll loop. */
const WATCHDOG_INTERVAL_MS = Number(process.env.PIPELINE_JOB_WATCHDOG_INTERVAL_MS ?? 60_000);
const SUBMIT_STALE_MS = Number(process.env.PIPELINE_SUBMIT_STALE_MS ?? 15 * 60 * 1000);

let watchdogTimer: ReturnType<typeof setInterval> | undefined;

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
