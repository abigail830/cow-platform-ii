import { eq } from 'drizzle-orm';
import {
  appEvalRunAttempts,
  appEvalRunItems,
  appEvalRunVariants,
  appEvalRuns,
  db,
  type EvalRunAsrHotword,
  type EvalRunAttemptAsrVocabularyEntry,
} from '../../db/index.ts';
import { getPipelineConfigById } from '../../shared/pipeline/pipeline-config-store.ts';
import { audioTranscribeModelDisplayNameFromPipeline } from '../../shared/pipeline/audio-transcribe-workflow.ts';
import { isAudioAsyncPipelineName } from '../audio/audio-pipeline-names.ts';
import { resolveModelCliParams } from '../models/model-cli-params.ts';
import {
  mergeHotwordsForChannel,
  validateHotwordText,
  validateHotwordWeight,
} from '../audio/asr-hotword-validation.ts';
import {
  dashScopeCreateVocabulary,
  dashScopeUpdateVocabulary,
  type DashScopeVocabularyCredentials,
} from '../audio/asr-vocabulary-sync.ts';

export type EvalRunAsrHotwordPublic = {
  text: string;
  weight: number;
  lang: string | null;
};

function toPublicHotword(row: EvalRunAsrHotword): EvalRunAsrHotwordPublic {
  return {
    text: row.text,
    weight: row.weight,
    lang: row.lang?.trim() || null,
  };
}

export function normalizeEvalRunHotwords(raw: unknown): EvalRunAsrHotword[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('hotwords must be an array');
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`hotwords[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text : '';
    const weight = Number(row.weight);
    const lang = row.lang == null ? null : String(row.lang);
    return { text, weight, lang };
  });
}

function evalRunVocabularyPrefix(runId: string, attemptId: string, pipelineName: string): string {
  const compact = `${runId}${attemptId}${pipelineName}`.replace(/-/g, '').toLowerCase();
  const alnum = compact.replace(/[^a-z0-9]/g, '');
  return `ev${alnum.slice(0, 8)}`;
}

function parseVocabularyCache(
  raw: Record<string, EvalRunAttemptAsrVocabularyEntry> | null | undefined,
): Record<string, EvalRunAttemptAsrVocabularyEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

async function resolvePipelineAsrCredentials(pipelineConfigId: string) {
  const pipeline = await getPipelineConfigById(pipelineConfigId);
  if (!pipeline || !isAudioAsyncPipelineName(pipeline.pipelineName)) return null;

  const displayName = audioTranscribeModelDisplayNameFromPipeline(pipeline);
  if (!displayName) return null;

  const cli = await resolveModelCliParams({
    modelName: displayName,
    expectedApiType: 'audio-asr',
  });
  if (!cli.api_key || !cli.base_url || !cli.model_name) {
    throw new Error('ASR model credentials are incomplete for eval pipeline');
  }

  return {
    targetModel: cli.model_name,
    apiKey: cli.api_key,
    baseUrl: cli.base_url,
  };
}

async function targetModelsForRun(runId: string): Promise<Set<string>> {
  const variants = await db
    .select({ pipelineConfigId: appEvalRunVariants.pipelineConfigId })
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.runId, runId));

  const models = new Set<string>();
  for (const variant of variants) {
    const creds = await resolvePipelineAsrCredentials(variant.pipelineConfigId);
    if (creds) models.add(creds.targetModel);
  }
  return models;
}

export async function validateEvalRunHotwordsForRun(
  runId: string,
  raw: unknown,
): Promise<EvalRunAsrHotwordPublic[]> {
  const parsed = normalizeEvalRunHotwords(raw);
  const models = await targetModelsForRun(runId);
  const modelList = models.size > 0 ? [...models] : ['qwen-audio-3.0-asr-flash-filetrans'];

  const validated: EvalRunAsrHotword[] = [];
  for (const item of parsed) {
    const text = validateHotwordText(item.text);
    let weight = item.weight;
    for (const model of modelList) {
      weight = validateHotwordWeight(weight, model);
    }
    validated.push({
      text,
      weight,
      lang: item.lang?.trim() || null,
    });
  }

  mergeHotwordsForChannel(
    validated.map((row) => ({
      text: row.text,
      weight: row.weight,
      lang: row.lang ?? null,
    })),
  );

  return validated.map(toPublicHotword);
}

export async function getEvalRunHotwords(runId: string): Promise<EvalRunAsrHotwordPublic[]> {
  const [run] = await db
    .select({ asrHotwords: appEvalRuns.asrHotwords })
    .from(appEvalRuns)
    .where(eq(appEvalRuns.id, runId))
    .limit(1);
  if (!run) throw new Error('Eval run not found');
  return normalizeEvalRunHotwords(run.asrHotwords).map(toPublicHotword);
}

export async function updateEvalRunHotwords(
  runId: string,
  raw: unknown,
): Promise<EvalRunAsrHotwordPublic[]> {
  const hotwords = await validateEvalRunHotwordsForRun(runId, raw);
  const [row] = await db
    .update(appEvalRuns)
    .set({
      asrHotwords: hotwords.length > 0 ? hotwords : null,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRuns.id, runId))
    .returning({ id: appEvalRuns.id });
  if (!row) throw new Error('Eval run not found');
  return hotwords;
}

async function compileVocabularyForPipeline(input: {
  creds: DashScopeVocabularyCredentials & { targetModel: string };
  hotwords: EvalRunAsrHotword[];
  runId: string;
  attemptId: string;
  pipelineName: string;
  cached: EvalRunAttemptAsrVocabularyEntry | undefined;
}): Promise<string> {
  const vocabulary = mergeHotwordsForChannel(
    input.hotwords.map((row) => ({
      text: row.text,
      weight: row.weight,
      lang: row.lang ?? null,
    })),
  );

  const prefix = evalRunVocabularyPrefix(input.runId, input.attemptId, input.pipelineName);
  const cached = input.cached;

  if (cached?.vocabulary_id && cached.target_model === input.creds.targetModel) {
    await dashScopeUpdateVocabulary(
      { apiKey: input.creds.apiKey, baseUrl: input.creds.baseUrl },
      { vocabularyId: cached.vocabulary_id, vocabulary },
    );
    return cached.vocabulary_id;
  }

  return dashScopeCreateVocabulary(
    { apiKey: input.creds.apiKey, baseUrl: input.creds.baseUrl },
    {
      targetModel: input.creds.targetModel,
      prefix,
      vocabulary,
    },
  );
}

export async function resolveEvalRunItemAsrVocabularyId(
  evalRunItem: typeof appEvalRunItems.$inferSelect,
): Promise<string | null> {
  const [attempt] = await db
    .select()
    .from(appEvalRunAttempts)
    .where(eq(appEvalRunAttempts.id, evalRunItem.attemptId))
    .limit(1);
  if (!attempt) return null;

  const hotwords = normalizeEvalRunHotwords(attempt.asrHotwordsSnapshot);
  if (hotwords.length === 0) return null;

  const pipelineName = evalRunItem.pipelineName;
  const cache = parseVocabularyCache(attempt.asrVocabularyByPipeline);
  const cached = cache[pipelineName];

  const [variant] = await db
    .select()
    .from(appEvalRunVariants)
    .where(eq(appEvalRunVariants.id, evalRunItem.variantId))
    .limit(1);
  if (!variant) return null;

  const creds = await resolvePipelineAsrCredentials(variant.pipelineConfigId);
  if (!creds) return null;

  if (cached?.vocabulary_id && cached.target_model === creds.targetModel) {
    return cached.vocabulary_id;
  }

  const vocabularyId = await compileVocabularyForPipeline({
    creds,
    hotwords,
    runId: attempt.runId,
    attemptId: attempt.id,
    pipelineName,
    cached,
  });

  const nextCache: Record<string, EvalRunAttemptAsrVocabularyEntry> = {
    ...cache,
    [pipelineName]: {
      vocabulary_id: vocabularyId,
      target_model: creds.targetModel,
    },
  };

  await db
    .update(appEvalRunAttempts)
    .set({
      asrVocabularyByPipeline: nextCache,
      updatedAt: new Date(),
    })
    .where(eq(appEvalRunAttempts.id, attempt.id));

  return vocabularyId;
}
