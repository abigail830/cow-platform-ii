import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertStorageClient,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from './s3-client.ts';
import { getStorageUploadUrl } from './document-files.ts';
import { normalizePrefix, validateKey } from './prefix-utils.ts';

const DEFAULT_LIST_EXPIRES = 900;
const DEFAULT_MUTATION_EXPIRES = 3600;

export type PresignedListManifest = {
  bucket: string;
  prefix: string;
  list_url: string;
};

export type PresignedStorageOperation = {
  kind: 'copy' | 'delete';
  url: string;
  method: 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  source_key: string;
};

/** Presigned ListObjectsV2 — signing is local; browser performs the GET (Vercel-safe). */
export async function presignListStorageObjects(params: {
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
  /** When true, omit delimiter so all keys under prefix are returned (folder move expansion). */
  recursive?: boolean;
}): Promise<PresignedListManifest> {
  const { client, config } = assertStorageClient();
  const prefix = normalizePrefix(params.prefix ?? '');
  const maxKeys = Math.min(Math.max(params.maxKeys ?? 100, 1), 200);

  const command = new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: prefix || undefined,
    Delimiter: params.recursive ? undefined : '/',
    MaxKeys: maxKeys,
    ContinuationToken: params.continuationToken || undefined,
  });

  const url = await getSignedUrl(client, command, { expiresIn: DEFAULT_LIST_EXPIRES });
  return { bucket: config.bucket, prefix, list_url: url };
}

export async function presignCreateStorageFolder(folderPrefix: string): Promise<{
  upload_url: string;
  prefix: string;
}> {
  const normalized = normalizePrefix(folderPrefix);
  validateKey(normalized);
  const upload_url = await getStorageUploadUrl(normalized, 'application/octet-stream', DEFAULT_MUTATION_EXPIRES);
  return { upload_url, prefix: normalized };
}

function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function presignCopyStorageObject(
  sourceKey: string,
  destKey: string,
): Promise<PresignedStorageOperation> {
  validateKey(sourceKey);
  validateKey(destKey);
  const { client, config } = assertStorageClient();
  const copySource = encodeCopySource(config.bucket, sourceKey);
  const command = new CopyObjectCommand({
    Bucket: config.bucket,
    Key: destKey,
    CopySource: copySource,
  });
  const url = await getSignedUrl(client, command, { expiresIn: DEFAULT_MUTATION_EXPIRES });
  return {
    kind: 'copy',
    url,
    method: 'PUT',
    headers: { 'x-amz-copy-source': copySource },
    source_key: sourceKey,
  };
}

export async function presignDeleteStorageObject(key: string): Promise<PresignedStorageOperation> {
  validateKey(key);
  const { client, config } = assertStorageClient();
  const url = await getSignedUrl(
    client,
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: DEFAULT_MUTATION_EXPIRES },
  );
  return {
    kind: 'delete',
    url,
    method: 'DELETE',
    source_key: key,
  };
}

export async function presignMoveStorageOperations(
  operations: Array<{ kind: 'copy' | 'delete'; source_key: string; dest_key?: string }>,
): Promise<PresignedStorageOperation[]> {
  const presigned: PresignedStorageOperation[] = [];
  for (const op of operations) {
    if (op.kind === 'copy') {
      if (!op.dest_key) throw new Error('copy operation requires dest_key');
      presigned.push(await presignCopyStorageObject(op.source_key, op.dest_key));
    } else {
      presigned.push(await presignDeleteStorageObject(op.source_key));
    }
  }
  return presigned;
}
