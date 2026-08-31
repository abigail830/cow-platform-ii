export type ParsedStorageFolder = {
  prefix: string;
};

export type ParsedStorageObject = {
  key: string;
  size: number;
  last_modified: string | null;
};

export type ParsedStorageListResponse = {
  prefix: string;
  folders: ParsedStorageFolder[];
  objects: ParsedStorageObject[];
  next_continuation_token: string | null;
  truncated: boolean;
};

function textContent(parent: Element | Document, selector: string): string | null {
  const node = parent.querySelector(selector);
  const value = node?.textContent?.trim();
  return value || null;
}

/** Parse S3 ListObjectsV2 XML (Aliyun OSS-compatible) from a presigned browser GET. */
export function parseListObjectsV2Xml(xml: string, prefix = ''): ParsedStorageListResponse {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid object storage list response');
  }
  if (doc.querySelector('Error Code')) {
    const code = textContent(doc, 'Error Code') ?? 'Error';
    const message = textContent(doc, 'Error Message') ?? 'Object storage list failed';
    throw new Error(`${code}: ${message}`);
  }

  const normalizedPrefix = prefix.endsWith('/') || !prefix ? prefix : `${prefix}/`;

  const folders: ParsedStorageFolder[] = [];
  for (const entry of doc.querySelectorAll('CommonPrefixes')) {
    const folderPrefix = textContent(entry, 'Prefix');
    if (folderPrefix) folders.push({ prefix: folderPrefix });
  }

  const objects: ParsedStorageObject[] = [];
  for (const entry of doc.querySelectorAll('Contents')) {
    const key = textContent(entry, 'Key');
    if (!key || key === normalizedPrefix) continue;
    if (key.endsWith('/') && !textContent(entry, 'Size')) continue;
    const sizeRaw = textContent(entry, 'Size');
    const size = sizeRaw ? Number(sizeRaw) : 0;
    const lastModified = textContent(entry, 'LastModified');
    if (key.endsWith('/') && size === 0) {
      if (!folders.some((folder) => folder.prefix === key)) {
        folders.push({ prefix: key });
      }
      continue;
    }
    if (key.endsWith('/')) continue;
    objects.push({
      key,
      size: Number.isFinite(size) ? size : 0,
      last_modified: lastModified,
    });
  }

  folders.sort((a, b) => a.prefix.localeCompare(b.prefix));
  objects.sort((a, b) => a.key.localeCompare(b.key));

  const truncated = textContent(doc, 'IsTruncated') === 'true';
  const nextToken = textContent(doc, 'NextContinuationToken');

  return {
    prefix,
    folders,
    objects,
    next_continuation_token: truncated && nextToken ? nextToken : null,
    truncated,
  };
}

export async function fetchPresignedListXml(listUrl: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(listUrl, { signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Object storage list failed';
    throw new Error(
      message === 'Failed to fetch'
        ? 'Object storage list failed (network/CORS). Allow GET from your frontend origin in OSS bucket CORS.'
        : message,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const snippet = body.replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(
      snippet
        ? `Object storage list failed (HTTP ${res.status}): ${snippet}`
        : `Object storage list failed (HTTP ${res.status})`,
    );
  }
  return res.text();
}
