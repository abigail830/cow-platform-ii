/** Helpers for document markdown image refs (relative bundle paths ↔ display URLs). */

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

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
