import { Readable } from 'node:stream';
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

function storageObjectStream(body: unknown): Readable | null {
  if (!body) return null;
  if (body instanceof Readable) return body;
  if (typeof body === 'object' && body !== null && 'transformToWebStream' in body) {
    const webStream = (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
    return Readable.fromWeb(webStream as import('node:stream/web').ReadableStream);
  }
  if (typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  return null;
}

export async function readStorageStream(key: string): Promise<Readable | null> {
  const { client, config } = assertStorageClient();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    return storageObjectStream(response.Body);
  } catch (error) {
    if (isS3NotFound(error)) return null;
    throw error;
  }
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
