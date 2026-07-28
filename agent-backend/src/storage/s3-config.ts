export type S3Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
};

export function getS3Config(): S3Config | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.AWS_BUCKET_NAME?.trim();

  if (!accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  const endpoint = process.env.AWS_ENDPOINT_URL?.trim() || undefined;
  const forcePathStyle =
    process.env.AWS_S3_FORCE_PATH_STYLE === 'true' ||
    process.env.AWS_S3_FORCE_PATH_STYLE === '1' ||
    Boolean(endpoint?.includes('localhost') || endpoint?.includes('127.0.0.1'));

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    region: process.env.AWS_REGION?.trim() || 'us-east-1',
    endpoint,
    forcePathStyle,
  };
}

export function isStorageEnabled(): boolean {
  return getS3Config() !== null;
}
