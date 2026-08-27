import { desc, eq } from 'drizzle-orm';
import {
  appEvalRunAttempts,
  db,
  type EvalRunMode,
  type EvalRunPhase,
  type EvalRunStatus,
} from '../db/index.ts';

export function toAttemptPublic(row: typeof appEvalRunAttempts.$inferSelect) {
  const startedMs = row.startedAt.getTime();
  const finishedMs = row.finishedAt?.getTime() ?? null;
  return {
    id: row.id,
    run_id: row.runId,
    attempt_number: row.attemptNumber,
    status: row.status,
    phase: row.phase,
    run_mode: row.runMode,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    duration_ms:
      finishedMs != null && finishedMs >= startedMs ? finishedMs - startedMs : null,
    total_run_items: row.totalRunItems,
    completed_run_items: row.completedRunItems,
    failed_run_items: row.failedRunItems,
    total_compare_items: row.totalCompareItems,
    completed_compare_items: row.completedCompareItems,
    failed_compare_items: row.failedCompareItems,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getLatestEvalRunAttempt(
  runId: string,
): Promise<typeof appEvalRunAttempts.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appEvalRunAttempts)
    .where(eq(appEvalRunAttempts.runId, runId))
    .orderBy(desc(appEvalRunAttempts.attemptNumber))
    .limit(1);
  return row ?? null;
}

export async function listEvalRunAttempts(
  runId: string,
): Promise<Array<typeof appEvalRunAttempts.$inferSelect>> {
  return db
    .select()
    .from(appEvalRunAttempts)
    .where(eq(appEvalRunAttempts.runId, runId))
    .orderBy(desc(appEvalRunAttempts.attemptNumber));
}

export async function createEvalRunAttempt(input: {
  runId: string;
  runMode: EvalRunMode;
}): Promise<typeof appEvalRunAttempts.$inferSelect> {
  const latest = await getLatestEvalRunAttempt(input.runId);
  const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
  const now = new Date();

  const [row] = await db
    .insert(appEvalRunAttempts)
    .values({
      runId: input.runId,
      attemptNumber,
      status: 'running',
      phase: 'transcribing',
      runMode: input.runMode,
      startedAt: now,
      updatedAt: now,
    })
    .returning();
  return row!;
}

export async function updateEvalRunAttempt(
  attemptId: string,
  patch: Partial<{
    status: EvalRunStatus;
    phase: EvalRunPhase;
    runMode: EvalRunMode;
    finishedAt: Date | null;
    totalRunItems: number;
    completedRunItems: number;
    failedRunItems: number;
    totalCompareItems: number;
    completedCompareItems: number;
    failedCompareItems: number;
  }>,
): Promise<void> {
  await db
    .update(appEvalRunAttempts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(appEvalRunAttempts.id, attemptId));
}

export async function syncEvalRunAttemptFromRun(
  attemptId: string,
  runId: string,
): Promise<void> {
  const { getEvalRunById } = await import('./eval-runs.ts');
  const run = await getEvalRunById(runId);
  if (!run) return;

  await updateEvalRunAttempt(attemptId, {
    status: run.status,
    phase: run.phase,
    runMode: run.runMode,
    totalRunItems: run.totalRunItems,
    completedRunItems: run.completedRunItems,
    failedRunItems: run.failedRunItems,
    totalCompareItems: run.totalCompareItems,
    completedCompareItems: run.completedCompareItems,
    failedCompareItems: run.failedCompareItems,
    finishedAt: run.status === 'running' ? null : new Date(),
  });
}
