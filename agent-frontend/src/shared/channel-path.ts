type ChannelWithParent = {
  id: string;
  name: string;
  parent_id: string | null;
};

export function buildChannelPath(
  flatChannels: readonly ChannelWithParent[],
  channelId: string,
  separator = ' / ',
): string {
  const byId = new Map(flatChannels.map((channel) => [channel.id, channel]));
  const parts: string[] = [];
  let current = byId.get(channelId);
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.join(separator);
}
