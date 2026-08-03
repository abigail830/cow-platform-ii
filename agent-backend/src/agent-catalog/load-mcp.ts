import { connectMcpServer, type McpServerConnection, type ToolDefinition } from '@flue/runtime';
import {
  createAgentRequestForwardingFetch,
} from '../flue/agent-request-context.ts';
import type { LoadedAgentSpec, McpServerYaml } from './schema.ts';

const connectionCache = new Map<string, McpServerConnection[]>();

const DEFAULT_HYBRID_SEARCH_MCP_URL_ENV = 'HYBRID_SEARCH_MCP_URL';
export const HYBRID_SEARCH_MCP_API_KEY_ENV = 'HYBRID_SEARCH_MCP_API_KEY';

export function resolveOpenkmsApiBaseUrl(): string {
  return process.env.OPENKMS_API_URL?.trim()?.replace(/\/$/, '') ?? 'http://127.0.0.1:8787';
}

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

export function resolveMcpServerUrl(server: McpServerYaml): string {
  const internalPath = server.internalPath?.trim();
  if (internalPath) {
    return `${resolveOpenkmsApiBaseUrl()}${internalPath}`;
  }

  const urlEnv = server.urlEnv?.trim();
  if (!urlEnv) {
    throw new Error(`MCP server "${server.name}" requires urlEnv or internalPath`);
  }

  const fromEnv = process.env[urlEnv]?.trim();
  if (fromEnv) return fromEnv;

  if (urlEnv === DEFAULT_HYBRID_SEARCH_MCP_URL_ENV) {
    return `${resolveOpenkmsApiBaseUrl()}/api/mcp/hybrid-search`;
  }

  throw new Error(`Missing MCP url env ${urlEnv} for server "${server.name}"`);
}

async function connectServer(server: McpServerYaml): Promise<McpServerConnection> {
  const url = resolveMcpServerUrl(server);

  return connectMcpServer(server.name, {
    url,
    transport: server.transport,
    headers: resolveHeaders(server.headersEnv),
    ...(server.useAgentRequestHeaders ? { fetch: createAgentRequestForwardingFetch() } : {}),
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
