import { eq } from 'drizzle-orm';
import { appPipelineJobs, db } from '../db/index.ts';
import { spawnPipelineCli } from './pipeline-runner.ts';

const POLL_INTERVAL_MS = Number(process.env.PIPELINE_POLL_INTERVAL_MS ?? 30_000);

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function startPipelinePollScheduler(): void {
  if (process.env.PIPELINE_POLL_SCHEDULER === 'false') return;
  if (pollTimer) return;

  pollTimer = setInterval(() => {
    void pollSubmittedJobs();
  }, POLL_INTERVAL_MS);

  console.info(`[pipeline] poll scheduler started (interval=${POLL_INTERVAL_MS}ms)`);
}

async function pollSubmittedJobs(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(appPipelineJobs)
      .where(eq(appPipelineJobs.stage, 'submitted'));

    for (const job of rows) {
      if (job.provider === 'baidu' || job.provider === 'aliyun') {
        spawnPipelineCli(['pipeline', 'poll', '--job-id', job.id]);
      }
    }
  } catch (error) {
    console.error('[pipeline] poll scheduler query failed:', error);
  }
}
