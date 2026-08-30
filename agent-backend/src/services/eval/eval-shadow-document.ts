import { and, eq } from 'drizzle-orm';
import { appDocumentChannels, appDocuments, appEvalDatasetItems, db } from '../../db/index.ts';
import { createChannel, createDocumentRecord } from '../documents/documents.ts';

export const EVAL_SHADOW_DOCUMENT_CHANNEL_NAME = 'Evaluation (datasets)';

const shadowDocumentByDatasetItem = new Map<string, string>();

export async function resolveEvalShadowDocumentChannelId(): Promise<string> {
  const configured = process.env.EVAL_DOCUMENT_CHANNEL_ID?.trim();
  if (configured) return configured;

  const [existing] = await db
    .select({ id: appDocumentChannels.id })
    .from(appDocumentChannels)
    .where(eq(appDocumentChannels.name, EVAL_SHADOW_DOCUMENT_CHANNEL_NAME))
    .limit(1);
  if (existing) return existing.id;

  const channel = await createChannel({
    name: EVAL_SHADOW_DOCUMENT_CHANNEL_NAME,
    description: 'System channel for evaluation dataset document parse (shadow document records)',
  });
  return channel.id;
}

export async function ensureEvalShadowDocumentForDatasetItem(
  datasetItemId: string,
): Promise<string> {
  const cached = shadowDocumentByDatasetItem.get(datasetItemId);
  if (cached) return cached;

  const [datasetItem] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.id, datasetItemId))
    .limit(1);
  if (!datasetItem) throw new Error('Dataset item not found');

  const [existing] = await db
    .select({ id: appDocuments.id })
    .from(appDocuments)
    .where(
      and(
        eq(appDocuments.fileHash, datasetItem.fileHash),
        eq(appDocuments.s3Key, datasetItem.s3Key),
      ),
    )
    .limit(1);
  if (existing) {
    shadowDocumentByDatasetItem.set(datasetItemId, existing.id);
    return existing.id;
  }

  const channelId = await resolveEvalShadowDocumentChannelId();
  const doc = await createDocumentRecord({
    channelId,
    name: datasetItem.name,
    fileType: datasetItem.fileType,
    sizeBytes: datasetItem.sizeBytes,
    fileHash: datasetItem.fileHash,
    s3Key: datasetItem.s3Key,
  });

  await db
    .update(appDocuments)
    .set({
      metadata: {
        eval_shadow: true,
        eval_dataset_item_id: datasetItem.id,
      },
      updatedAt: new Date(),
    })
    .where(eq(appDocuments.id, doc.id));

  shadowDocumentByDatasetItem.set(datasetItemId, doc.id);
  return doc.id;
}

export function isEvalShadowDocument(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata && metadata.eval_shadow === true);
}
