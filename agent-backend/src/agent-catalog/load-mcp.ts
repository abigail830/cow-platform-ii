import { connectMcpServer, type McpServerConnection, type ToolDefinition } from '@flue/runtime';
import type { LoadedAgentSpec, McpServerYaml } from './schema.ts';

const connectionCache = new Map<string, McpServerConnection[]>();

function resolveHeaders(headersEnv?: Record<string, string>): HeadersInit | undefined {
  if (!headersEnv) return undefined;
  const headers: Record<string, string> = {};
  for (const [header, envName] of Object.entries(headersEnv)) {
    const value = process.env[envName]?.trim();
    if (!value) {
      throw new Error(`Missing MCP header env ${envName} for header ${header}`);
    }
    headers[header] = value;
  }
  return headers;
}

async function connectServer(server: McpServerYaml): Promise<McpServerConnection> {
  const url = process.env[server.urlEnv]?.trim();
  if (!url) {
    throw new Error(`Missing MCP url env ${server.urlEnv} for server "${server.name}"`);
  }

  return connectMcpServer(server.name, {
    url,
    transport: server.transport,
    headers: resolveHeaders(server.headersEnv),
  });
}

function filterMcpTools(
  connection: McpServerConnection,
  allowTools?: string[],
): ToolDefinition[] {
  if (!allowTools?.length) return connection.tools;
  const allowed = new Set(allowTools);
  const filtered = connection.tools.filter((tool) => allowed.has(tool.name));
  if (filtered.length === 0) {
    throw new Error(
      `MCP server "${connection.name}" has no tools matching allowTools: ${allowTools.join(', ')}`,
    );
  }
  return filtered;
}

export async function connectAgentMcpTools(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  if (!spec.mcp.length) return [];

  let connections = connectionCache.get(spec.id);
  if (!connections) {
    connections = await Promise.all(spec.mcp.map((server) => connectServer(server)));
    connectionCache.set(spec.id, connections);
  }

  const tools: ToolDefinition[] = [];
  for (const connection of connections) {
    const serverSpec = spec.mcp.find((entry) => entry.name === connection.name);
    tools.push(...filterMcpTools(connection, serverSpec?.allowTools));
  }
  return tools;
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
