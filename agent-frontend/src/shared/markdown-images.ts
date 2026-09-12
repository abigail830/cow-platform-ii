/** Helpers for document markdown image refs (relative bundle paths ↔ display URLs). */

export const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const OSS_IMAGE_HOST_RE = /aliyuncs\.com|amazonaws\.com/i;

export function collectRelativeMarkdownImagePaths(markdown: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const url = (match[2] ?? '').trim();
    if (!url || /^(https?:|data:)/i.test(url)) continue;
    const normalized = url.replace(/^\.\//, '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    paths.push(normalized);
  }
  return paths;
}

/** Candidate storage keys to try for a relative markdown image path. */
export function markdownImagePathCandidates(path: string): string[] {
  const normalized = path.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!normalized) return [];
  if (normalized.startsWith('markdown_out/')) return [normalized];
  return [normalized, `markdown_out/${normalized}`];
}

/** Map a stale OSS presigned URL to bundle-relative storage path candidates. */
export function ossMarkdownImagePathCandidates(url: string): string[] {
  try {
    const parsed = new URL(url);
    if (!OSS_IMAGE_HOST_RE.test(parsed.hostname)) return [];
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
    if (!name) return [];
    return markdownImagePathCandidates(name);
  } catch {
    return [];
  }
}

/** Storage paths to presign for all images referenced in document markdown. */
export function collectDocumentMarkdownImageStoragePaths(markdown: string): string[] {
  const pathSet = new Set<string>();
  for (const path of collectRelativeMarkdownImagePaths(markdown)) {
    for (const candidate of markdownImagePathCandidates(path)) {
      pathSet.add(candidate);
    }
  }
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const url = (match[2] ?? '').trim();
    if (!/^https?:/i.test(url)) continue;
    for (const candidate of ossMarkdownImagePathCandidates(url)) {
      pathSet.add(candidate);
    }
  }
  return [...pathSet];
}

/** Resolve a markdown image src to a bundle storage path key (if known). */
export function markdownImageSrcStorageCandidates(src: string): string[] {
  const trimmed = src.trim();
  if (!trimmed) return [];
  if (/^https?:/i.test(trimmed)) return ossMarkdownImagePathCandidates(trimmed);
  const normalized = trimmed.replace(/^\.\//, '').replace(/^\/+/, '');
  return markdownImagePathCandidates(normalized);
}

export function rewriteMarkdownImageUrls(
  markdown: string,
  urlMap: ReadonlyMap<string, string> | Record<string, string>,
): string {
  const lookup = urlMap instanceof Map ? urlMap : new Map(Object.entries(urlMap));
  if (lookup.size === 0) return markdown;

  return markdown.replace(MD_IMAGE_RE, (full, alt: string, url: string) => {
    const trimmed = url.trim();
    const resolved = lookup.get(trimmed) ?? lookup.get(trimmed.replace(/^\.\//, ''));
    if (!resolved) return full;
    return `![${alt}](${resolved})`;
  });
}
