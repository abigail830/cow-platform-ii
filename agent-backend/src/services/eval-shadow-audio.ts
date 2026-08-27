import { and, eq } from 'drizzle-orm';
import { appAudioChannels, appAudios, appEvalDatasetItems, db } from '../db/index.ts';
import { createAudioChannel, createAudioRecord } from './audios.ts';

export const EVAL_SHADOW_CHANNEL_NAME = 'Evaluation (datasets)';

const shadowAudioByDatasetItem = new Map<string, string>();

export async function resolveEvalShadowAudioChannelId(): Promise<string> {
  const configured = process.env.EVAL_AUDIO_CHANNEL_ID?.trim();
  if (configured) return configured;

  const [existing] = await db
    .select({ id: appAudioChannels.id })
    .from(appAudioChannels)
    .where(eq(appAudioChannels.name, EVAL_SHADOW_CHANNEL_NAME))
    .limit(1);
  if (existing) return existing.id;

  const channel = await createAudioChannel({
    name: EVAL_SHADOW_CHANNEL_NAME,
    description: 'System channel for evaluation dataset transcription (shadow audio records)',
  });
  return channel.id;
}

export async function ensureEvalShadowAudioForDatasetItem(
  datasetItemId: string,
): Promise<string> {
  const cached = shadowAudioByDatasetItem.get(datasetItemId);
  if (cached) return cached;

  const [datasetItem] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.id, datasetItemId))
    .limit(1);
  if (!datasetItem) throw new Error('Dataset item not found');

  const [existing] = await db
    .select({ id: appAudios.id })
    .from(appAudios)
    .where(
      and(
        eq(appAudios.fileHash, datasetItem.fileHash),
        eq(appAudios.s3Key, datasetItem.s3Key),
      ),
    )
    .limit(1);
  if (existing) {
    shadowAudioByDatasetItem.set(datasetItemId, existing.id);
    return existing.id;
  }

  const channelId = await resolveEvalShadowAudioChannelId();
  const audio = await createAudioRecord({
    channelId,
    name: datasetItem.name,
    fileType: datasetItem.fileType,
    sizeBytes: datasetItem.sizeBytes,
    fileHash: datasetItem.fileHash,
    s3Key: datasetItem.s3Key,
  });

  await db
    .update(appAudios)
    .set({
      metadata: {
        eval_shadow: true,
        eval_dataset_item_id: datasetItem.id,
      },
      updatedAt: new Date(),
    })
    .where(eq(appAudios.id, audio.id));

  shadowAudioByDatasetItem.set(datasetItemId, audio.id);
  return audio.id;
}

export function isEvalShadowAudio(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata && metadata.eval_shadow === true);
}
