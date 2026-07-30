import { GetObjectCommand } from './s3-client.ts';
import { assertStorageClient } from './s3-client.ts';

export function storagePrefixFromS3Key(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}

export async function readStorageText(key: string): Promise<string | null> {
  const buffer = await readStorageBuffer(key);
  if (!buffer) return null;
  return buffer.toString('utf-8');
}

export async function readStorageBuffer(key: string): Promise<Buffer | null> {
  const { client, config } = assertStorageClient();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch (error) {
    if (isS3NotFound(error)) return null;
    throw error;
  }
}
