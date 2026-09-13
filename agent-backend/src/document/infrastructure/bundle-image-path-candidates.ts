/** Candidate bundle-relative paths for markdown images (.jpg/.jpeg variants, markdown_out/). */

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

export function bundleImagePathCandidates(bundleRelativePath: string): string[] {
  const normalized = bundleRelativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
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
