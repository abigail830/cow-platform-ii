import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { appEvalDatasetItems, appEvalDatasets, db } from '../../db/index.ts';
import type { EvalDatasetKind, EvalMediaType } from '../../db/index.ts';
import {
  buildEvalDatasetItemS3Key,
  buildEvalDatasetReferenceS3Key,
  extensionFromFilename,
  fileTypeFromExtension,
  getEvalDatasetItemReadUrl,
  getEvalDatasetItemUploadUrl,
  guessEvalDatasetContentType,
  guessEvalDatasetReferenceContentType,
  MAX_EVAL_DATASET_ITEM_BYTES,
  MAX_EVAL_DATASET_REFERENCE_BYTES,
  newEvalDatasetItemId,
  validateEvalDatasetFilename,
  validateFileHash,
} from '../../storage/eval-dataset-files.ts';
import { deleteEvalDatasetStorageObject } from '../../storage/eval-dataset-files.ts';
import {
  roundDurationSec,
} from '../../shared/eval/eval-audio-duration.ts';
import { formatEvalDatasetDbError } from './eval-dataset-db-error.ts';

export type EvalDatasetRow = typeof appEvalDatasets.$inferSelect;
export type EvalDatasetItemRow = typeof appEvalDatasetItems.$inferSelect;

function toDatasetPublic(row: EvalDatasetRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    media_type: row.mediaType,
    item_count: row.itemCount,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toItemPublic(row: EvalDatasetItemRow) {
  return {
    id: row.id,
    dataset_id: row.datasetId,
    name: row.name,
    file_type: row.fileType,
    size_bytes: row.sizeBytes,
    file_hash: row.fileHash,
    s3_key: row.s3Key,
    sort_order: row.sortOrder,
    metadata: row.metadata ?? {},
    reference_s3_key: row.referenceS3Key,
    uploaded_by: row.uploadedBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function listEvalDatasets(): Promise<ReturnType<typeof toDatasetPublic>[]> {
  const rows = await db
    .select()
    .from(appEvalDatasets)
    .orderBy(desc(appEvalDatasets.updatedAt));
  return rows.map(toDatasetPublic);
}

export async function getEvalDatasetById(id: string): Promise<EvalDatasetRow | null> {
  const [row] = await db.select().from(appEvalDatasets).where(eq(appEvalDatasets.id, id)).limit(1);
  return row ?? null;
}

export async function createEvalDataset(input: {
  name: string;
  description?: string | null;
  kind?: EvalDatasetKind;
  mediaType?: EvalMediaType;
  createdBy?: string | null;
}) {
  const name = input.name.trim();
  if (!name || name.length > 256) throw new Error('Dataset name must be 1–256 characters');

  const [row] = await db
    .insert(appEvalDatasets)
    .values({
      name,
      description: input.description?.trim() || null,
      kind: input.kind ?? 'test',
      mediaType: input.mediaType ?? 'audio',
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return toDatasetPublic(row!);
}

export async function updateEvalDataset(
  id: string,
  input: { name?: string; description?: string | null },
) {
  const existing = await getEvalDatasetById(id);
  if (!existing) throw new Error('Dataset not found');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name || name.length > 256) throw new Error('Dataset name must be 1–256 characters');

  const [row] = await db
    .update(appEvalDatasets)
    .set({
      name,
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appEvalDatasets.id, id))
    .returning();

  return toDatasetPublic(row!);
}

export async function deleteEvalDataset(id: string): Promise<void> {
  const existing = await getEvalDatasetById(id);
  if (!existing) throw new Error('Dataset not found');

  const items = await listEvalDatasetItems(id);
  await db.delete(appEvalDatasets).where(eq(appEvalDatasets.id, id));

  for (const item of items) {
    try {
      await deleteEvalDatasetStorageObject(item.s3_key);
    } catch {
      // best-effort OSS cleanup
    }
    if (item.reference_s3_key) {
      try {
        await deleteEvalDatasetStorageObject(item.reference_s3_key);
      } catch {
        // best-effort OSS cleanup
      }
    }
  }
}

export async function listEvalDatasetItems(datasetId: string) {
  const rows = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, datasetId))
    .orderBy(asc(appEvalDatasetItems.sortOrder), asc(appEvalDatasetItems.name));
  return rows.map(toItemPublic);
}

export async function getEvalDatasetItemById(
  datasetId: string,
  itemId: string,
): Promise<EvalDatasetItemRow | null> {
  const [row] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.id, itemId))
    .limit(1);
  if (!row || row.datasetId !== datasetId) return null;
  return row;
}

async function getEvalDatasetItemByHash(
  datasetId: string,
  fileHash: string,
): Promise<EvalDatasetItemRow | null> {
  const [row] = await db
    .select()
    .from(appEvalDatasetItems)
    .where(
      and(
        eq(appEvalDatasetItems.datasetId, datasetId),
        eq(appEvalDatasetItems.fileHash, fileHash),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function initEvalDatasetItemUpload(input: {
  datasetId: string;
  filename: string;
  fileHash: string;
  sizeBytes: number;
  contentType?: string;
}) {
  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Dataset not found');
  if (dataset.mediaType !== 'audio') {
    throw new Error('Only audio datasets are supported in this version');
  }

  const filename = validateEvalDatasetFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const sizeBytes = input.sizeBytes;

  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (sizeBytes > MAX_EVAL_DATASET_ITEM_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }

  const existing = await getEvalDatasetItemByHash(input.datasetId, fileHash);
  if (existing) {
    return {
      item_id: existing.id,
      s3_key: existing.s3Key,
      file_hash: fileHash,
      skip_upload: true as const,
    };
  }

  const ext = extensionFromFilename(filename);
  const itemId = newEvalDatasetItemId();
  const s3Key = buildEvalDatasetItemS3Key(input.datasetId, itemId, ext);
  const contentType = input.contentType?.trim() || guessEvalDatasetContentType(ext);
  const uploadUrl = await getEvalDatasetItemUploadUrl(s3Key, contentType);

  return {
    item_id: itemId,
    s3_key: s3Key,
    file_hash: fileHash,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
    skip_upload: false as const,
  };
}

function buildDatasetItemMetadata(
  durationSec?: number | null,
  source: 'client' | 'manual' | 'import' = 'client',
): Record<string, unknown> {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return {};
  }
  return {
    duration_sec: roundDurationSec(durationSec),
    duration_source: source,
  };
}

export async function updateEvalDatasetItemDuration(
  datasetId: string,
  itemId: string,
  durationSec: number | null,
  source: 'manual' | 'import' = 'manual',
) {
  const item = await getEvalDatasetItemById(datasetId, itemId);
  if (!item) throw new Error('Dataset item not found');

  const prior =
    item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? { ...(item.metadata as Record<string, unknown>) }
      : {};

  let metadata: Record<string, unknown>;
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    const { duration_sec: _a, duration_seconds: _b, duration_source: _c, ...rest } = prior;
    metadata = rest;
  } else {
    metadata = {
      ...prior,
      duration_sec: roundDurationSec(durationSec),
      duration_source: source,
    };
  }

  const [row] = await db
    .update(appEvalDatasetItems)
    .set({ metadata, updatedAt: new Date() })
    .where(and(eq(appEvalDatasetItems.id, itemId), eq(appEvalDatasetItems.datasetId, datasetId)))
    .returning();

  if (!row) throw new Error('Dataset item not found');
  return toItemPublic(row);
}

export async function finalizeEvalDatasetItemUpload(input: {
  datasetId: string;
  itemId: string;
  filename: string;
  fileHash: string;
  s3Key: string;
  sizeBytes: number;
  durationSec?: number | null;
  uploadedBy?: string | null;
}) {
  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Dataset not found');

  const filename = validateEvalDatasetFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const ext = extensionFromFilename(filename);
  const expectedKey = buildEvalDatasetItemS3Key(input.datasetId, input.itemId, ext);

  if (input.s3Key !== expectedKey) {
    throw new Error('s3_key does not match dataset item path');
  }

  const sizeBytes = input.sizeBytes;
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }

  const existingById = await getEvalDatasetItemById(input.datasetId, input.itemId);
  if (existingById) {
    if (existingById.fileHash !== fileHash || existingById.s3Key !== expectedKey) {
      throw new Error('item_id is already used by another file');
    }
    return toItemPublic(existingById);
  }

  const existingByHash = await getEvalDatasetItemByHash(input.datasetId, fileHash);
  if (existingByHash) {
    return toItemPublic(existingByHash);
  }

  try {
    return await db.transaction(async (tx) => {
      const siblings = await tx
        .select({ sortOrder: appEvalDatasetItems.sortOrder })
        .from(appEvalDatasetItems)
        .where(eq(appEvalDatasetItems.datasetId, input.datasetId));
      const maxSort = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1);

      const metadata = buildDatasetItemMetadata(input.durationSec);

      const [row] = await tx
        .insert(appEvalDatasetItems)
        .values({
          id: input.itemId,
          datasetId: input.datasetId,
          name: filename,
          fileType: fileTypeFromExtension(ext),
          sizeBytes,
          fileHash,
          s3Key: expectedKey,
          sortOrder: maxSort + 1,
          metadata,
          uploadedBy: input.uploadedBy ?? null,
        })
        .returning();

      await tx
        .update(appEvalDatasets)
        .set({
          itemCount: sql`${appEvalDatasets.itemCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(appEvalDatasets.id, input.datasetId));

      return toItemPublic(row!);
    });
  } catch (error) {
    throw new Error(formatEvalDatasetDbError(error), { cause: error });
  }
}

export async function deleteEvalDatasetItem(datasetId: string, itemId: string): Promise<void> {
  const item = await getEvalDatasetItemById(datasetId, itemId);
  if (!item) throw new Error('Dataset item not found');

  await db.delete(appEvalDatasetItems).where(eq(appEvalDatasetItems.id, itemId));

  await db
    .update(appEvalDatasets)
    .set({
      itemCount: sql`GREATEST(${appEvalDatasets.itemCount} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(appEvalDatasets.id, datasetId));

  try {
    await deleteEvalDatasetStorageObject(item.s3Key);
  } catch {
    // best-effort
  }
  if (item.referenceS3Key) {
    try {
      await deleteEvalDatasetStorageObject(item.referenceS3Key);
    } catch {
      // best-effort
    }
  }
}

export async function getEvalDatasetItemDownloadUrl(datasetId: string, itemId: string) {
  const item = await getEvalDatasetItemById(datasetId, itemId);
  if (!item) throw new Error('Dataset item not found');
  const downloadUrl = await getEvalDatasetItemReadUrl(item.s3Key);
  return { download_url: downloadUrl, filename: item.name };
}

export async function initEvalDatasetReferenceUpload(input: {
  datasetId: string;
  itemId: string;
  sizeBytes: number;
}) {
  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Dataset not found');

  const item = await getEvalDatasetItemById(input.datasetId, input.itemId);
  if (!item) throw new Error('Dataset item not found');

  const sizeBytes = input.sizeBytes;
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
    throw new Error('size_bytes is required');
  }
  if (sizeBytes > MAX_EVAL_DATASET_REFERENCE_BYTES) {
    throw new Error('Reference text exceeds maximum allowed size');
  }

  const s3Key = buildEvalDatasetReferenceS3Key(input.datasetId, input.itemId);
  const contentType = guessEvalDatasetReferenceContentType();
  const uploadUrl = await getEvalDatasetItemUploadUrl(s3Key, contentType);

  return {
    s3_key: s3Key,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
  };
}

export async function finalizeEvalDatasetReferenceUpload(input: {
  datasetId: string;
  itemId: string;
  s3Key: string;
}) {
  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Dataset not found');

  const item = await getEvalDatasetItemById(input.datasetId, input.itemId);
  if (!item) throw new Error('Dataset item not found');

  const expectedKey = buildEvalDatasetReferenceS3Key(input.datasetId, input.itemId);
  if (input.s3Key !== expectedKey) {
    throw new Error('s3_key does not match dataset reference path');
  }

  const [row] = await db
    .update(appEvalDatasetItems)
    .set({
      referenceS3Key: expectedKey,
      updatedAt: new Date(),
    })
    .where(eq(appEvalDatasetItems.id, input.itemId))
    .returning();

  await db
    .update(appEvalDatasets)
    .set({ updatedAt: new Date() })
    .where(eq(appEvalDatasets.id, input.datasetId));

  return toItemPublic(row!);
}

export async function getEvalDatasetReferenceDownloadUrl(datasetId: string, itemId: string) {
  const item = await getEvalDatasetItemById(datasetId, itemId);
  if (!item) throw new Error('Dataset item not found');
  if (!item.referenceS3Key) throw new Error('Reference transcript not uploaded');
  const downloadUrl = await getEvalDatasetItemReadUrl(item.referenceS3Key);
  return { download_url: downloadUrl, filename: `${item.name}.reference.txt` };
}

export async function assertEvalDatasetGroundTruthReady(
  datasetId: string,
  scenarioLabel: string,
): Promise<void> {
  const items = await db
    .select({ name: appEvalDatasetItems.name, referenceS3Key: appEvalDatasetItems.referenceS3Key })
    .from(appEvalDatasetItems)
    .where(eq(appEvalDatasetItems.datasetId, datasetId));

  const missing = items.filter((item) => !item.referenceS3Key).map((item) => item.name);
  if (missing.length === 0) return;

  const preview = missing.slice(0, 5).join(', ');
  const suffix = missing.length > 5 ? ` (+${missing.length - 5} more)` : '';
  throw new Error(
    `Ground-truth references required for scenario "${scenarioLabel}". Missing for: ${preview}${suffix}`,
  );
}
