import { listExpiredSessionFileIds } from '../../storage/session-files/repository.ts';
import { deleteSessionFile } from '../../storage/session-files/session-file-service.ts';

/** Remove session files past expires_at. Safe to run from cron or startup. */
export async function cleanupExpiredSessionFiles(now = new Date()): Promise<number> {
  const expired = await listExpiredSessionFileIds(now);
  let removed = 0;
  for (const entry of expired) {
    const ok = await deleteSessionFile(entry.instanceId, entry.fileId);
    if (ok) removed += 1;
  }
  return removed;
}
