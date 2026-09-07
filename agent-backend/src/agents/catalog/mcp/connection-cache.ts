import type { McpServerConnection } from '@flue/runtime';

const connectionCache = new Map<string, McpServerConnection[]>();

export function getMcpConnectionCache(): Map<string, McpServerConnection[]> {
  return connectionCache;
}

export async function closeAllMcpConnections(): Promise<void> {
  const closers: Promise<void>[] = [];
  for (const connections of connectionCache.values()) {
    for (const connection of connections) {
      closers.push(connection.close());
    }
  }
  connectionCache.clear();
  await Promise.allSettled(closers);
}

export function resetMcpConnectionsForTests(): void {
  connectionCache.clear();
}
