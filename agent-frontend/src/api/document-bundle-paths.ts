/** Collect storage-relative artifact paths referenced in result.json. */
export function extractPathsFromParseResult(
  result: Record<string, unknown>,
  fileHash: string,
): string[] {
  const paths = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    paths.add(normalizeBundleRelativePath(fileHash, raw));
  };

  const parsingList = result.parsing_res_list;
  if (Array.isArray(parsingList)) {
    for (const block of parsingList) {
      if (!block || typeof block !== 'object') continue;
      add((block as Record<string, unknown>).image_path);
    }
  }

  const layoutList = result.layout_det_res;
  if (Array.isArray(layoutList)) {
    for (const page of layoutList) {
      if (!page || typeof page !== 'object') continue;
      const record = page as Record<string, unknown>;
      add(record.input_img);
      add(record.input_path);
      const images = record.images;
      if (Array.isArray(images)) {
        for (const image of images) {
          if (!image || typeof image !== 'object') continue;
          add((image as Record<string, unknown>).path);
        }
      }
    }
  }

  return [...paths];
}

export function normalizeBundleRelativePath(fileHash: string, rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const prefixes = [`documents/${fileHash}/`, `${fileHash}/`];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }
  return normalized;
}
