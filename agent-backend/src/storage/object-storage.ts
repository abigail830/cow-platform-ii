import {
  assertStorageClient,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  StorageNotConfiguredError,
} from './s3-client.ts';
import {
  basenameFromKey,
  destinationKeyForObject,
  destinationPrefixForFolder,
  joinPrefix,
  normalizePrefix,
  StorageValidationError,
  validateFolderName,
  validateKey,
} from './prefix-utils.ts';

export type StorageInfo = {
  bucket: string;
  storage_enabled: boolean;
};

export type StorageFolder = {
  prefix: string;
};

export type StorageObject = {
  key: string;
  size: number;
  last_modified: string | null;
};

export type ListObjectsResult = {
  prefix: string;
  folders: StorageFolder[];
  objects: StorageObject[];
  next_continuation_token: string | null;
  truncated: boolean;
};

export type MoveItem = {
  type: 'prefix' | 'object';
  key: string;
};

export type MoveResult = {
  moved_count: number;
  skipped_count: number;
  errors: string[];
};

export function getStorageInfo(): StorageInfo {
  const client = assertStorageClient();
  return {
    bucket: client.config.bucket,
    storage_enabled: true,
  };
}

export async function listStorageObjects(params: {
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<ListObjectsResult> {
  const { client, config } = assertStorageClient();
  const prefix = normalizePrefix(params.prefix ?? '');
  const maxKeys = Math.min(Math.max(params.maxKeys ?? 100, 1), 200);

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix || undefined,
      Delimiter: '/',
      MaxKeys: maxKeys,
      ContinuationToken: params.continuationToken || undefined,
    }),
  );

  const folders: StorageFolder[] = (response.CommonPrefixes ?? [])
    .map((entry) => entry.Prefix)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ prefix: value }));

  const objects: StorageObject[] = (response.Contents ?? [])
    .filter((entry) => entry.Key && entry.Key !== prefix)
    .filter((entry) => !entry.Key!.endsWith('/'))
    .map((entry) => ({
      key: entry.Key!,
      size: entry.Size ?? 0,
      last_modified: entry.LastModified ? entry.LastModified.toISOString() : null,
    }));

  // Zero-byte folder placeholders ending with / may appear in Contents.
  for (const entry of response.Contents ?? []) {
    if (!entry.Key || entry.Key === prefix) continue;
    if (entry.Key.endsWith('/') && (entry.Size ?? 0) === 0) {
      if (!folders.some((folder) => folder.prefix === entry.Key)) {
        folders.push({ prefix: entry.Key });
      }
    }
  }

  folders.sort((a, b) => a.prefix.localeCompare(b.prefix));
  objects.sort((a, b) => a.key.localeCompare(b.key));

  return {
    prefix,
    folders,
    objects,
    next_continuation_token: response.NextContinuationToken ?? null,
    truncated: Boolean(response.IsTruncated),
  };
}

export async function createStorageFolder(params: {
  parentPrefix?: string;
  name: string;
}): Promise<{ prefix: string }> {
  const { client, config } = assertStorageClient();
  validateFolderName(params.name);

  const parent = normalizePrefix(params.parentPrefix ?? '');
  const folderPrefix = joinPrefix(parent, params.name);

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: folderPrefix,
      }),
    );
    throw new StorageValidationError('Target folder already exists');
  } catch (error) {
    if (error instanceof StorageValidationError) throw error;
    const httpStatus = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (error as { name?: string }).name;
    const notFound = httpStatus === 404 || name === 'NotFound' || name === 'NoSuchKey';
    if (!notFound) {
      const message = error instanceof Error ? error.message : 'Failed to check folder';
      throw new Error(message);
    }
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: folderPrefix,
        Body: new Uint8Array(),
        ContentLength: 0,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    throw new Error(message);
  }

  return { prefix: folderPrefix };
}

async function listAllKeysUnderPrefix(prefix: string): Promise<string[]> {
  const { client, config } = assertStorageClient();
  const normalized = normalizePrefix(prefix);
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: normalized,
        ContinuationToken: continuationToken,
      }),
    );

    for (const entry of response.Contents ?? []) {
      if (entry.Key) keys.push(entry.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function copyObject(sourceKey: string, destinationKey: string): Promise<void> {
  const { client, config } = assertStorageClient();
  const copySource = `${config.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: copySource,
      Key: destinationKey,
    }),
  );
}

async function deleteObject(key: string): Promise<void> {
  const { client, config } = assertStorageClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

export async function moveStorageItems(params: {
  items: MoveItem[];
  destinationPrefix: string;
  deleteSource?: boolean;
}): Promise<MoveResult> {
  if (params.items.length === 0 || params.items.length > 200) {
    throw new StorageValidationError('items must contain 1–200 entries');
  }

  const destination = normalizePrefix(params.destinationPrefix);
  const deleteSource = params.deleteSource !== false;
  let movedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const item of params.items) {
    try {
      validateKey(item.key);

      if (item.type === 'object') {
        const targetKey = destinationKeyForObject(destination, item.key);
        if (targetKey === item.key) {
          skippedCount += 1;
          continue;
        }

        await copyObject(item.key, targetKey);
        if (deleteSource) await deleteObject(item.key);
        movedCount += 1;
        continue;
      }

      const sourceFolder = normalizePrefix(item.key);
      const targetFolder = destinationPrefixForFolder(destination, sourceFolder);
      if (targetFolder === sourceFolder) {
        skippedCount += 1;
        continue;
      }

      const keys = await listAllKeysUnderPrefix(sourceFolder);
      if (keys.length === 0) {
        skippedCount += 1;
        continue;
      }

      for (const sourceKey of keys) {
        const relative = sourceKey.slice(sourceFolder.length);
        const targetKey = `${targetFolder}${relative}`;
        await copyObject(sourceKey, targetKey);
        if (deleteSource) await deleteObject(sourceKey);
        movedCount += 1;
      }
    } catch (error) {
      const label = item.key;
      const message = error instanceof Error ? error.message : 'Move failed';
      errors.push(`${label}: ${message}`);
    }
  }

  return { moved_count: movedCount, skipped_count: skippedCount, errors };
}

export { StorageNotConfiguredError, StorageValidationError };
