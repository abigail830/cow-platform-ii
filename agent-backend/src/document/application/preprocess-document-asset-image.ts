import sharp from 'sharp';

export const DEFAULT_ASSET_IMAGE_MAX_DIMENSION = 1024;
/** Skip vision embed when the OSS object is larger than this (pre-resize). */
export const MAX_ASSET_IMAGE_INPUT_BYTES = 8 * 1024 * 1024;

export type PreprocessedDocumentAssetImage = {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  originalWidth: number | null;
  originalHeight: number | null;
  bytes: number;
  dataUri: string;
  note: string;
};

function mimeTypeForFormat(format: string | undefined): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'tiff':
      return 'image/tiff';
    case 'jpeg':
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

export async function preprocessDocumentAssetImage(
  input: Buffer,
  options?: { maxDimension?: number },
): Promise<PreprocessedDocumentAssetImage> {
  if (input.length > MAX_ASSET_IMAGE_INPUT_BYTES) {
    throw new Error(
      `Image exceeds ${MAX_ASSET_IMAGE_INPUT_BYTES} byte input limit (${input.length} bytes)`,
    );
  }

  const maxDimension = options?.maxDimension ?? DEFAULT_ASSET_IMAGE_MAX_DIMENSION;
  const pipeline = sharp(input, { animated: false }).rotate();
  const metadata = await pipeline.metadata();

  if (metadata.format === 'svg') {
    throw new Error('SVG assets are not resized for vision embed; use fetch_url instead');
  }

  const resized = pipeline.resize({
    width: maxDimension,
    height: maxDimension,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const format = metadata.format;
  let output: Buffer;
  if (format === 'png') {
    output = await resized.png().toBuffer();
  } else if (format === 'webp') {
    output = await resized.webp().toBuffer();
  } else if (format === 'gif') {
    output = await resized.gif().toBuffer();
  } else {
    output = await resized.jpeg({ quality: 85 }).toBuffer();
  }

  const outMeta = await sharp(output).metadata();
  const outputFormat =
    outMeta.format ?? (format === 'png' || format === 'webp' || format === 'gif' ? format : 'jpeg');
  const mimeType = mimeTypeForFormat(outputFormat);
  const base64 = output.toString('base64');

  return {
    base64,
    mimeType,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    originalWidth: metadata.width ?? null,
    originalHeight: metadata.height ?? null,
    bytes: output.length,
    dataUri: `data:${mimeType};base64,${base64}`,
    note: 'Image scaled proportionally for model vision input',
  };
}
