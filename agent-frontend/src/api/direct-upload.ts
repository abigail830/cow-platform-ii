/** Below Vercel serverless body limit (~4.5 MB); use direct storage upload above this. */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 3.5 * 1024 * 1024;

/** Chunk size for legacy multipart assembly — keep under Vercel request body limit. */
export const UPLOAD_CHUNK_SIZE_BYTES = 3 * 1024 * 1024;

export const CHUNK_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;

export function usesRemoteApiOrigin(): boolean {
  return Boolean(import.meta.env.VITE_API_ORIGIN?.trim());
}

/** Production and remote API must never proxy object bytes through Vercel. Local dev may for small files. */
export function shouldUseDirectUpload(file: File): boolean {
  return import.meta.env.PROD || usesRemoteApiOrigin() || file.size > DIRECT_UPLOAD_THRESHOLD_BYTES;
}

export async function putFileToPresignedUrl(
  uploadUrl: string,
  body: Blob | File,
  headers: Record<string, string> = {},
  method = 'PUT',
): Promise<void> {
  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method,
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Direct storage upload failed';
    throw new Error(
      message === 'Failed to fetch'
        ? 'Direct storage upload failed (network/CORS). In Aliyun OSS CORS, allow PUT from your frontend origin.'
        : message,
    );
  }
  if (!putRes.ok) {
    throw new Error(`Direct storage upload failed (HTTP ${putRes.status})`);
  }
}
