/** Fetch object text from a presigned OSS URL (browser → OSS, not via API server). */
export async function fetchPresignedStorageText(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(url, { signal });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) {
    throw new Error(`Object storage read failed (${res.status})`);
  }
  return res.text();
}
