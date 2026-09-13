/** Helpers for document markdown image refs (relative bundle paths ↔ display URLs). */

export const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const OSS_IMAGE_HOST_RE = /aliyuncs\.com|amazonaws\.com|docmind/i;

const PLATFORM_ASSET_PATH_RE =
  /^(?:https?:\/\/[^/]+)?\/api\/knowledge\/documents\/([0-9a-f-]{36})\/assets\/(.+)$/i;

export type ParsedPlatformAssetUrl = {
  documentId: string;
  path: string;
};

export function parsePlatformAssetUrl(src: string): ParsedPlatformAssetUrl | null {
  const trimmed = src.trim();
  const match = PLATFORM_ASSET_PATH_RE.exec(trimmed);
  if (!match) return null;
  try {
    return {
      documentId: match[1]!,
      path: decodeURIComponent(match[2]!),
    };
  } catch {
    return null;
  }
}

export function isPlatformAssetUrl(src: string): boolean {
  return parsePlatformAssetUrl(src) !== null;
}

/** Bundle-relative paths from platform asset URLs in markdown (for ticket minting). */
export function collectPlatformDocumentAssetPaths(
  markdown: string,
  documentId?: string,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const parsed = parsePlatformAssetUrl(match[2] ?? '');
    if (!parsed) continue;
    if (documentId && parsed.documentId !== documentId) continue;
    if (seen.has(parsed.path)) continue;
    seen.add(parsed.path);
    paths.push(parsed.path);
  }
  return paths;
}

export function collectRelativeMarkdownImagePaths(markdown: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const url = (match[2] ?? '').trim();
    if (!url || isPlatformAssetUrl(url) || /^(https?:|data:)/i.test(url)) continue;
    const normalized = url.replace(/^\.\//, '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    paths.push(normalized);
  }
  return paths;
}

/** DocMind alt/path often disagree on .jpg vs .jpeg — try both when presigning bundle files. */
export function imageBasenameVariants(name: string): string[] {
  const variants = new Set<string>([name]);
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpeg')) {
    variants.add(`${name.slice(0, -5)}.jpg`);
  } else if (lower.endsWith('.jpg')) {
    variants.add(`${name.slice(0, -4)}.jpeg`);
  }
  return [...variants];
}

/** Candidate storage keys to try for a relative markdown image path. */
export function markdownImagePathCandidates(path: string): string[] {
  const normalized = path.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!normalized) return [];
  const slash = normalized.lastIndexOf('/');
  const dir = slash >= 0 ? normalized.slice(0, slash + 1) : '';
  const baseName = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const candidates = new Set<string>();

  for (const variant of imageBasenameVariants(baseName)) {
    const rel = `${dir}${variant}`;
    candidates.add(rel);
    if (!rel.startsWith('markdown_out/')) {
      candidates.add(`markdown_out/${variant}`);
    }
  }

  return [...candidates];
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

/** Storage paths to presign for bundle images (legacy OSS URLs + platform asset paths). */
export function collectDocumentMarkdownImageStoragePaths(
  markdown: string,
  documentId?: string,
): string[] {
  const pathSet = new Set<string>();
  for (const path of collectRelativeMarkdownImagePaths(markdown)) {
    for (const candidate of markdownImagePathCandidates(path)) {
      pathSet.add(candidate);
    }
  }
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const alt = (match[1] ?? '').trim();
    const url = (match[2] ?? '').trim();
    const platform = parsePlatformAssetUrl(url);
    if (platform) {
      if (!documentId || platform.documentId === documentId) {
        for (const candidate of markdownImagePathCandidates(platform.path)) {
          pathSet.add(candidate);
        }
      }
      if (alt) {
        for (const candidate of markdownImagePathCandidates(alt)) {
          pathSet.add(candidate);
        }
      }
      continue;
    }
    if (!/^https?:/i.test(url)) continue;
    for (const candidate of ossMarkdownImagePathCandidates(url)) {
      pathSet.add(candidate);
    }
    if (alt) {
      for (const candidate of markdownImagePathCandidates(alt)) {
        pathSet.add(candidate);
      }
    }
  }
  return [...pathSet];
}

export function buildPlatformAssetTicketByPath(
  tickets: ReadonlyArray<{ path: string; url: string }>,
): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const ticket of tickets) {
    if (ticket.path && ticket.url) byPath.set(ticket.path, ticket.url);
  }
  return byPath;
}

/** @deprecated Prefer ticketByPath — react-markdown may normalize src to an absolute URL. */
export function buildPlatformAssetTicketLookup(
  tickets: ReadonlyArray<{ path: string; url: string }>,
  markdown: string,
): Map<string, string> {
  const byPath = buildPlatformAssetTicketByPath(tickets);
  const bySrc = new Map<string, string>();
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const src = (match[2] ?? '').trim();
    const parsed = parsePlatformAssetUrl(src);
    if (!parsed) continue;
    const ticketUrl = byPath.get(parsed.path);
    if (ticketUrl) bySrc.set(src, ticketUrl);
  }
  return bySrc;
}

export function resolveDocumentMarkdownImageUrl(
  src: string,
  ticketByPath: ReadonlyMap<string, string>,
  urlByStoragePath: ReadonlyMap<string, string>,
  alt?: string,
): string | undefined {
  const trimmed = src.trim();
  const platform = parsePlatformAssetUrl(trimmed);
  if (platform) {
    const ticketUrl = ticketByPath.get(platform.path);
    if (ticketUrl) return ticketUrl;
    for (const candidate of markdownImagePathCandidates(platform.path)) {
      const url = urlByStoragePath.get(candidate);
      if (url) return url;
    }
  }

  const fromSrc = resolvePresignedImageUrl(trimmed, urlByStoragePath);
  if (fromSrc) return fromSrc;

  const altName = alt?.trim();
  if (!altName) return undefined;
  for (const candidate of markdownImagePathCandidates(altName)) {
    const url = urlByStoragePath.get(candidate);
    if (url) return url;
  }
  return undefined;
}

/** Resolve a markdown image src to a bundle storage path key (if known). */
/** Lookup map keyed by full storage path and basename (for markdown refs like `img.jpg`). */
export function buildImagePresignLookup(
  files: ReadonlyArray<{ path: string; url: string }>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const file of files) {
    if (!file.path || !file.url) continue;
    lookup.set(file.path, file.url);
    const base = file.path.split('/').pop();
    if (base && !lookup.has(base)) lookup.set(base, file.url);
  }
  return lookup;
}

export function resolvePresignedImageUrl(
  src: string,
  urlByStoragePath: ReadonlyMap<string, string>,
): string | undefined {
  for (const storagePath of markdownImageSrcStorageCandidates(src)) {
    const url = urlByStoragePath.get(storagePath);
    if (url) return url;
  }
  const trimmed = src.trim();
  if (!/^https?:/i.test(trimmed)) {
    const base = trimmed.replace(/^\.\//, '').split('/').pop();
    if (base) {
      const byBase = urlByStoragePath.get(base);
      if (byBase) return byBase;
    }
  }
  return undefined;
}

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
