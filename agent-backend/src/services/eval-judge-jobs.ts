import { eq } from 'drizzle-orm';
import {
  appEvalDatasetItems,
  appEvalRunAttempts,
  appEvalRunItems,
  appEvalRunJudgeJobs,
  appEvalRunVariants,
  appEvalRuns,
  db,
  type EvalRunJudgeStatus,
} from '../db/index.ts';
import { readStorageText } from '../storage/document-content.ts';
import type { EvalJudgeDimensionDefinition } from './eval-judge-dimensions.ts';

export async function getEvalJudgeJobById(id: string) {
  const [row] = await db
    .select()
    .from(appEvalRunJudgeJobs)
    .where(eq(appEvalRunJudgeJobs.id, id))
    .limit(1);
  return row ?? null;
}

export async function buildEvalJudgeJobContext(jobId: string) {
  const job = await getEvalJudgeJobById(jobId);
  if (!job) throw new Error('Eval judge job not found');

  const [run] = await db.select().from(appEvalRuns).where(eq(appEvalRuns.id, job.runId)).limit(1);
  if (!run) throw new Error('Eval run not found');

  const [attempt] = await db
    .select()
    .from(appEvalRunAttempts)
    .where(eq(appEvalRunAttempts.id, job.attemptId))
    .limit(1);
  if (!attempt) throw new Error('Eval run attempt not found');

  const [datasetItem] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.id, job.datasetItemId))
    .limit(1);
  if (!datasetItem) throw new Error('Dataset item not found');

  const variants = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, job.runId));

  const items = await db
    .select()
    .from(appEvalRunItems)
    .where(eq(appEvalRunItems.attemptId, job.attemptId));

  const targetItems = items.filter(
    (item) => item.datasetItemId === job.datasetItemId && item.stage === 'done' && item.transcriptS3Key,
  );

  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const transcripts = [];
  for (const item of targetItems) {
    const variant = variantById.get(item.variantId);
    if (!variant || !item.transcriptS3Key) continue;
    const text = await readStorageText(item.transcriptS3Key);
    if (text == null) continue;
    transcripts.push({
      variant_id: variant.id,
      pipeline_name: variant.pipelineName,
      display_name: variant.displayName,
      transcript: text,
    });
  }

  if (transcripts.length < 2) {
    throw new Error('At least two successful transcripts are required for judge evaluation');
  }

  return {
    job_id: job.id,
    run_id: job.runId,
    attempt_id: job.attemptId,
    dataset_item_id: job.datasetItemId,
    dataset_item_name: datasetItem.name,
    scenario_id: job.scenarioId,
    dimensions: job.dimensionsSnapshot as EvalJudgeDimensionDefinition[],
    transcripts,
    llm: {
      model: process.env.EVAL_JUDGE_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    },
  };
}

export async function updateEvalJudgeJob(
  jobId: string,
  input: {
    status?: EvalRunJudgeStatus;
    resultS3Key?: string | null;
    errorMessage?: string | null;
    summaryMetrics?: Record<string, unknown> | null;
  },
) {
  const [row] = await db
    .update(appEvalRunJudgeJobs)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.resultS3Key !== undefined ? { resultS3Key: input.resultS3Key } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      ...(input.summaryMetrics !== undefined ? { summaryMetrics: input.summaryMetrics } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunJudgeJobs.id, jobId))
    .returning();
  return row ?? null;
}
