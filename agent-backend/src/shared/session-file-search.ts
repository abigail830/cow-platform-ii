import { readSessionFileCachedText, readSessionFileBytes } from '../storage/session-files/session-file-service.ts';
import { listSessionFileRecords } from '../storage/session-files/session-file-service.ts';
import { extractSessionFileText } from './session-file-extract.ts';

export type SessionFileSearchHit = {
  fileId: string;
  filename: string;
  line: number;
  excerpt: string;
};

export async function searchSessionFiles(options: {
  instanceId: string;
  query: string;
  limit?: number;
}): Promise<SessionFileSearchHit[]> {
  const query = options.query.trim().toLowerCase();
  if (!query) return [];

  const maxHits = Math.min(50, Math.max(1, options.limit ?? 20));
  const hits: SessionFileSearchHit[] = [];
  const records = await listSessionFileRecords(options.instanceId);

  for (const record of records) {
    if (hits.length >= maxHits) break;

    let text = await readSessionFileCachedText(options.instanceId, record.id);
    if (text === null) {
      const { bytes } = await readSessionFileBytes(options.instanceId, record.id);
      const extracted = await extractSessionFileText({
        filename: record.filename,
        mimeType: record.mimeType,
        bytes,
      });
      text = extracted.text;
    }

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!line.toLowerCase().includes(query)) continue;
      hits.push({
        fileId: record.id,
        filename: record.filename,
        line: index + 1,
        excerpt: line.trim().slice(0, 500),
      });
      if (hits.length >= maxHits) break;
    }
  }

  return hits;
}
