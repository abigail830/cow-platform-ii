import { collectDescendantIds } from '../../document/domain/channel-tree.ts';

export function expandBoundChannelIds(
  boundChannelIds: string[],
  includeSubfolders: boolean,
  channelRows: Array<{ id: string; parent_id: string | null }>,
): Set<string> {
  const result = new Set<string>();
  for (const channelId of boundChannelIds) {
    const trimmed = channelId.trim();
    if (!trimmed) continue;
    result.add(trimmed);
    if (includeSubfolders) {
      for (const id of collectDescendantIds(trimmed, channelRows)) {
        result.add(id);
      }
    }
  }
  return result;
}

export function documentMatchesBoundFolders(
  documentChannelId: string,
  boundChannelIds: Set<string>,
): boolean {
  return boundChannelIds.has(documentChannelId);
}

export function clampSyncIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(1440, Math.max(5, Math.round(value)));
}

export function folderSyncBatchSize(): number {
  const raw = Number(process.env.KB_FOLDER_SYNC_BATCH_SIZE ?? '50');
  if (!Number.isFinite(raw) || raw < 1) return 50;
  return Math.min(200, Math.round(raw));
}
