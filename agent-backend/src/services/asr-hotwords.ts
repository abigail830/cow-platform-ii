import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  appAsrHotwordChannels,
  appAsrHotwords,
  appAudioChannels,
  db,
} from '../db/index.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { audioTranscribeModelDisplayNameFromPipeline } from '../shared/audio-transcribe-workflow.ts';
import { isAudioAsyncPipelineName } from './audio-pipeline-names.ts';
import { resolveModelCliParams } from './model-cli-params.ts';
import {
  channelVocabularyPrefix,
  mergeHotwordsForChannel,
  validateHotwordText,
  validateHotwordWeight,
  type AsrHotwordInput,
} from './asr-hotword-validation.ts';
import {
  dashScopeCreateVocabulary,
  dashScopeDeleteVocabulary,
  dashScopeUpdateVocabulary,
} from './asr-vocabulary-sync.ts';
import { getAudioChannelById } from './audios.ts';

export type AsrHotwordPublic = {
  id: string;
  text: string;
  weight: number;
  lang: string | null;
  note: string | null;
  channel_ids: string[];
  created_at: string;
  updated_at: string;
};

function toPublic(
  row: typeof appAsrHotwords.$inferSelect,
  channelIds: string[],
): AsrHotwordPublic {
  return {
    id: row.id,
    text: row.text,
    weight: row.weight,
    lang: row.lang,
    note: row.note,
    channel_ids: channelIds,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function channelIdsForHotwords(hotwordIds: string[]): Promise<Map<string, string[]>> {
  if (hotwordIds.length === 0) return new Map();
  const links = await db
    .select({
      hotwordId: appAsrHotwordChannels.hotwordId,
      channelId: appAsrHotwordChannels.channelId,
    })
    .from(appAsrHotwordChannels)
    .where(inArray(appAsrHotwordChannels.hotwordId, hotwordIds));
  const map = new Map<string, string[]>();
  for (const link of links) {
    const list = map.get(link.hotwordId) ?? [];
    list.push(link.channelId);
    map.set(link.hotwordId, list);
  }
  return map;
}

export async function listAsrHotwords(input?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ hotwords: AsrHotwordPublic[]; total: number }> {
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const offset = (page - 1) * limit;
  const search = input?.search?.trim();

  const rows = search
    ? await db
        .select()
        .from(appAsrHotwords)
        .where(sql`${appAsrHotwords.text} ILIKE ${`%${search}%`}`)
        .orderBy(asc(appAsrHotwords.text))
        .limit(limit)
        .offset(offset)
    : await db
        .select()
        .from(appAsrHotwords)
        .orderBy(asc(appAsrHotwords.text))
        .limit(limit)
        .offset(offset);

  const totalRow = search
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appAsrHotwords)
        .where(sql`${appAsrHotwords.text} ILIKE ${`%${search}%`}`)
    : await db.select({ count: sql<number>`count(*)::int` }).from(appAsrHotwords);
  const total = totalRow[0]?.count ?? 0;

  const channelMap = await channelIdsForHotwords(rows.map((row) => row.id));
  return {
    hotwords: rows.map((row) => toPublic(row, channelMap.get(row.id) ?? [])),
    total,
  };
}

export async function getAsrHotwordById(id: string): Promise<AsrHotwordPublic | null> {
  const [row] = await db.select().from(appAsrHotwords).where(eq(appAsrHotwords.id, id)).limit(1);
  if (!row) return null;
  const channelMap = await channelIdsForHotwords([row.id]);
  return toPublic(row, channelMap.get(row.id) ?? []);
}

export async function listHotwordsForChannel(channelId: string): Promise<AsrHotwordPublic[]> {
  const links = await db
    .select({ hotwordId: appAsrHotwordChannels.hotwordId })
    .from(appAsrHotwordChannels)
    .where(eq(appAsrHotwordChannels.channelId, channelId));
  const ids = links.map((link) => link.hotwordId);
  if (ids.length === 0) return [];
  const rows = await db.select().from(appAsrHotwords).where(inArray(appAsrHotwords.id, ids));
  const channelMap = await channelIdsForHotwords(ids);
  return rows.map((row) => toPublic(row, channelMap.get(row.id) ?? []));
}

async function resolveChannelAsrCredentials(channelId: string) {
  const channel = await getAudioChannelById(channelId);
  if (!channel?.pipelineId) return null;
  const pipeline = await getPipelineConfigById(channel.pipelineId);
  if (!pipeline || !isAudioAsyncPipelineName(pipeline.pipelineName)) return null;

  const displayName = audioTranscribeModelDisplayNameFromPipeline(pipeline);
  if (!displayName) return null;

  const cli = await resolveModelCliParams({
    modelName: displayName,
    expectedApiType: 'audio-asr',
  });
  if (!cli.api_key || !cli.base_url || !cli.model_name) {
    throw new Error('ASR model credentials are incomplete for channel transcription pipeline');
  }

  return {
    channel,
    pipeline,
    targetModel: cli.model_name,
    apiKey: cli.api_key,
    baseUrl: cli.base_url,
  };
}

async function mergedHotwordRowsForChannel(channelId: string) {
  return db
    .select({
      text: appAsrHotwords.text,
      weight: appAsrHotwords.weight,
      lang: appAsrHotwords.lang,
    })
    .from(appAsrHotwordChannels)
    .innerJoin(appAsrHotwords, eq(appAsrHotwordChannels.hotwordId, appAsrHotwords.id))
    .where(eq(appAsrHotwordChannels.channelId, channelId));
}

export async function syncChannelAsrVocabulary(channelId: string): Promise<void> {
  const channel = await getAudioChannelById(channelId);
  if (!channel) throw new Error('Channel not found');

  const creds = await resolveChannelAsrCredentials(channelId);
  const rows = await mergedHotwordRowsForChannel(channelId);

  if (rows.length > 0 && !creds) {
    throw new Error('Channel has linked hotwords but no ASR transcription pipeline is configured');
  }

  if (!creds || rows.length === 0) {
    if (channel.asrVocabularyId?.trim()) {
      const staleId = channel.asrVocabularyId.trim();
      if (creds?.apiKey && creds.baseUrl) {
        try {
          await dashScopeDeleteVocabulary(
            { apiKey: creds.apiKey, baseUrl: creds.baseUrl },
            staleId,
          );
        } catch {
          // Best-effort cleanup; channel state still cleared locally.
        }
      }
    }
    await db
      .update(appAudioChannels)
      .set({
        asrVocabularyId: null,
        asrVocabularyTargetModel: null,
        asrVocabularySyncedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(appAudioChannels.id, channelId));
    return;
  }

  const vocabulary = mergeHotwordsForChannel(rows);
  const prefix = channelVocabularyPrefix(channelId);

  let vocabularyId = channel.asrVocabularyId?.trim() || '';
  const sameModel = channel.asrVocabularyTargetModel === creds.targetModel;

  if (vocabularyId && sameModel) {
    await dashScopeUpdateVocabulary(
      { apiKey: creds.apiKey, baseUrl: creds.baseUrl },
      { vocabularyId, vocabulary },
    );
  } else {
    if (vocabularyId && creds.apiKey) {
      try {
        await dashScopeDeleteVocabulary(
          { apiKey: creds.apiKey, baseUrl: creds.baseUrl },
          vocabularyId,
        );
      } catch {
        // Ignore stale vocabulary cleanup failures.
      }
    }
    vocabularyId = await dashScopeCreateVocabulary(
      { apiKey: creds.apiKey, baseUrl: creds.baseUrl },
      {
        targetModel: creds.targetModel,
        prefix,
        vocabulary,
      },
    );
  }

  await db
    .update(appAudioChannels)
    .set({
      asrVocabularyId: vocabularyId,
      asrVocabularyTargetModel: creds.targetModel,
      asrVocabularySyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(appAudioChannels.id, channelId));
}

export async function resyncChannelsForHotword(hotwordId: string): Promise<void> {
  const links = await db
    .select({ channelId: appAsrHotwordChannels.channelId })
    .from(appAsrHotwordChannels)
    .where(eq(appAsrHotwordChannels.hotwordId, hotwordId));
  for (const link of links) {
    await syncChannelAsrVocabulary(link.channelId);
  }
}

async function replaceHotwordChannels(hotwordId: string, channelIds: string[]): Promise<void> {
  await db.delete(appAsrHotwordChannels).where(eq(appAsrHotwordChannels.hotwordId, hotwordId));
  const unique = [...new Set(channelIds)];
  if (unique.length === 0) return;
  await db.insert(appAsrHotwordChannels).values(
    unique.map((channelId) => ({
      hotwordId,
      channelId,
    })),
  );
}

export async function createAsrHotword(
  input: AsrHotwordInput & { channelIds?: string[]; createdBy?: string | null },
): Promise<AsrHotwordPublic> {
  const channelIds = input.channelIds ?? [];
  const creds = channelIds.length > 0 ? await resolveChannelAsrCredentials(channelIds[0]) : null;
  const providerModelId = creds?.targetModel ?? 'qwen-audio-3.0-asr-flash-filetrans';

  const text = validateHotwordText(input.text);
  const weight = validateHotwordWeight(input.weight, providerModelId);
  const lang = input.lang?.trim() || null;
  const note = input.note?.trim() || null;

  const [row] = await db
    .insert(appAsrHotwords)
    .values({
      text,
      weight,
      lang,
      note,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  if (channelIds.length > 0) {
    await replaceHotwordChannels(row!.id, channelIds);
    for (const channelId of [...new Set(channelIds)]) {
      await syncChannelAsrVocabulary(channelId);
    }
  }

  const channelMap = await channelIdsForHotwords([row!.id]);
  return toPublic(row!, channelMap.get(row!.id) ?? []);
}

export async function updateAsrHotword(
  id: string,
  input: Partial<AsrHotwordInput> & { channelIds?: string[] },
): Promise<AsrHotwordPublic> {
  const existing = await getAsrHotwordById(id);
  if (!existing) throw new Error('Hotword not found');

  const creds = await resolveChannelAsrCredentials(
    existing.channel_ids[0] ?? (input.channelIds?.[0] ?? ''),
  );
  const providerModelId = creds?.targetModel ?? 'qwen-audio-3.0-asr-flash-filetrans';

  const text = input.text !== undefined ? validateHotwordText(input.text) : existing.text;
  const weight =
    input.weight !== undefined ? validateHotwordWeight(input.weight, providerModelId) : existing.weight;
  const lang = input.lang !== undefined ? input.lang?.trim() || null : existing.lang;
  const note = input.note !== undefined ? input.note?.trim() || null : existing.note;

  const [row] = await db
    .update(appAsrHotwords)
    .set({
      text,
      weight,
      lang,
      note,
      updatedAt: new Date(),
    })
    .where(eq(appAsrHotwords.id, id))
    .returning();

  const affectedChannels = new Set(existing.channel_ids);
  if (input.channelIds !== undefined) {
    await replaceHotwordChannels(id, input.channelIds);
    for (const channelId of input.channelIds) affectedChannels.add(channelId);
  } else {
    await resyncChannelsForHotword(id);
  }

  if (input.channelIds !== undefined) {
    for (const channelId of affectedChannels) {
      await syncChannelAsrVocabulary(channelId);
    }
  }

  const channelMap = await channelIdsForHotwords([row!.id]);
  return toPublic(row!, channelMap.get(row!.id) ?? []);
}

export async function deleteAsrHotword(id: string): Promise<void> {
  const existing = await getAsrHotwordById(id);
  if (!existing) throw new Error('Hotword not found');

  const channelIds = [...existing.channel_ids];
  await db.delete(appAsrHotwords).where(eq(appAsrHotwords.id, id));

  for (const channelId of channelIds) {
    await syncChannelAsrVocabulary(channelId);
  }
}

export async function getChannelAsrVocabularyIdForJob(channelId: string): Promise<string | null> {
  const channel = await getAudioChannelById(channelId);
  if (!channel?.asrVocabularyId?.trim()) return null;
  const creds = await resolveChannelAsrCredentials(channelId);
  if (!creds) return null;
  if (channel.asrVocabularyTargetModel !== creds.targetModel) {
    await syncChannelAsrVocabulary(channelId);
    const refreshed = await getAudioChannelById(channelId);
    return refreshed?.asrVocabularyId?.trim() || null;
  }
  return channel.asrVocabularyId.trim();
}

export async function syncChannelAsrVocabularyIfPipelineChanged(
  channelId: string,
  previousPipelineId: string | null,
  nextPipelineId: string | null,
): Promise<void> {
  if (previousPipelineId === nextPipelineId) return;
  const links = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appAsrHotwordChannels)
    .where(eq(appAsrHotwordChannels.channelId, channelId));
  if ((links[0]?.count ?? 0) === 0) return;
  await syncChannelAsrVocabulary(channelId);
}
