import type { ResourcePermissionFlags } from '../api/resourceAccess.ts';
import { flattenChannels, type DocumentChannel } from '../api/documentChannels.ts';
import { buildChannelPath } from './channel-path.ts';

/** Match backend `satisfiesResourcePermission(..., 'write')`. Missing flags = no access. */
export function channelHasWriteAccess(
  channel: { my_access?: ResourcePermissionFlags | null } | null | undefined,
): boolean {
  const flags = channel?.my_access;
  if (!flags) return false;
  return Boolean(flags.write || flags.manage);
}

export type ChannelMoveOption = {
  id: string;
  label: string;
};

/**
 * Destination channels the current user can write into.
 * Read-only nodes and ancestor placeholders (`my_access` all false) are excluded.
 */
export function listWritableChannelMoveOptions(
  channels: DocumentChannel[],
  currentChannelId: string,
): ChannelMoveOption[] {
  const flatChannels = flattenChannels(channels);
  return flatChannels
    .filter((channel) => channel.id !== currentChannelId && channelHasWriteAccess(channel))
    .map((channel) => ({
      id: channel.id,
      label: buildChannelPath(flatChannels, channel.id, '/'),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
