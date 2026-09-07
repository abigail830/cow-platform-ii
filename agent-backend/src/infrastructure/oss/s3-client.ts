import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { getS3Config, type S3Config } from './s3-config.ts';

let cachedClient: S3Client | null = null;
let cachedConfigKey = '';

function configKey(config: S3Config): string {
  return `${config.endpoint ?? ''}|${config.region}|${config.bucket}|${config.forcePathStyle}`;
}

export function getS3Client(): { client: S3Client; config: S3Config } | null {
  const config = getS3Config();
  if (!config) return null;

  const key = configKey(config);
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Default WHEN_SUPPORTED signs x-amz-checksum-* into presigned PUTs;
      // browsers do not send those headers → OSS/S3 HTTP 403 AccessDenied.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({
        // Bundle downloads list + fetch many objects; allow slower OSS links.
        connectionTimeout: 30_000,
        requestTimeout: 120_000,
      }),
    });
    cachedConfigKey = key;
  }

  return { client: cachedClient, config };
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Object storage is not configured');
    this.name = 'StorageNotConfiguredError';
  }
}

export function assertStorageClient(): { client: S3Client; config: S3Config } {
  const result = getS3Client();
  if (!result) throw new StorageNotConfiguredError();
  return result;
}

export {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
};
