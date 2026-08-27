import { connectMcpServer, type McpServerConnection, type ToolDefinition } from '@flue/runtime';
import { and, eq, inArray } from 'drizzle-orm';
import { expandMcpTemplateString, parseMcpServersJson } from '../agent-assets/parse-mcp-servers.ts';
import { loadPlatformMcpTemplate } from '../agent-assets/manifest.ts';
import { DATASOURCE_ID_HEADER } from '../database-mcp/constants.ts';
import { discoverStaticPlatformMcpTools } from '../database-mcp/static-discovery.ts';
import { listDatasourceIdsByNamesForUser } from '../database-mcp/datasource-service.ts';
import { appUserDatasources, appUserMcpCredentials, db } from '../db/index.ts';
import {
  createAgentRequestForwardingFetch,
  getAgentRequestContext,
} from '../flue/agent-request-context.ts';
import { decryptModelConfigApiKey } from '../shared/model/model-config-secret.ts';
import type { LoadedAgentSpec, McpServerYaml } from './schema.ts';

const connectionCache = new Map<string, McpServerConnection[]>();

const DEFAULT_HYBRID_SEARCH_MCP_URL_ENV = 'HYBRID_SEARCH_MCP_URL';
export const HYBRID_SEARCH_MCP_API_KEY_ENV = 'HYBRID_SEARCH_MCP_API_KEY';
const DEFAULT_PAGEINDEX_SEARCH_MCP_URL_ENV = 'PAGEINDEX_SEARCH_MCP_URL';
export const PAGEINDEX_SEARCH_MCP_API_KEY_ENV = 'PAGEINDEX_SEARCH_MCP_API_KEY';

const PLATFORM_LOOPBACK_MCP_IDS = new Set(['hybrid-search', 'pageindex-search']);

function isPlatformLoopbackMcp(platformMcpId: string): boolean {
  return PLATFORM_LOOPBACK_MCP_IDS.has(platformMcpId);
}

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
  if (urlEnv === DEFAULT_PAGEINDEX_SEARCH_MCP_URL_ENV) {
    return `${resolveOpenkmsApiBaseUrl()}/api/mcp/pageindex-search`;
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

async function userApiKeyForPlatformMcp(platformMcpId: string, userId?: string): Promise<string | undefined> {
  const ctx = getAgentRequestContext();
  if (platformMcpId === 'hybrid-search' || platformMcpId === 'pageindex-search') {
    const fromHeader = ctx?.openkmsApiKey?.trim();
    if (fromHeader) return fromHeader.startsWith('Bearer ') ? fromHeader.slice(7) : fromHeader;
  }
  if (!userId) return undefined;
  const [row] = await db
    .select({ secrets: appUserMcpCredentials.secrets })
    .from(appUserMcpCredentials)
    .where(
      and(eq(appUserMcpCredentials.userId, userId), eq(appUserMcpCredentials.platformMcpId, platformMcpId)),
    )
    .limit(1);
  return decryptModelConfigApiKey(row?.secrets) ?? undefined;
}

function resolvePlatformMcpApiKey(
  platformMcpId: string,
  userKey: string | undefined,
): string | undefined {
  if (userKey) return userKey;
  if (platformMcpId === 'hybrid-search') {
    return process.env[HYBRID_SEARCH_MCP_API_KEY_ENV]?.replace(/^Bearer\s+/i, '');
  }
  if (platformMcpId === 'pageindex-search') {
    return process.env[PAGEINDEX_SEARCH_MCP_API_KEY_ENV]?.replace(/^Bearer\s+/i, '');
  }
  if (platformMcpId === 'zhipu-web-search') {
    return process.env.ZHIPU_API_KEY?.trim();
  }
  return undefined;
}

/** Probe a platform MCP once and return discovered tool names (Cursor-style runtime list). */
export async function listPlatformMcpDiscoveredTools(
  platformMcpId: string,
  userId?: string,
): Promise<
  | { status: 'ok'; tools: Array<{ name: string; description?: string }> }
  | { status: 'needs_key'; tools: [] }
  | { status: 'error'; tools: []; error: string }
> {
  const staticTools = discoverStaticPlatformMcpTools(platformMcpId);
  if (staticTools) return staticTools;
  try {
    const template = loadPlatformMcpTemplate(platformMcpId);
    const parsed = parseMcpServersJson({ mcpServers: template.mcpServers });
    if (!parsed.ok) return { status: 'error', tools: [], error: parsed.error };

    const userKey = await userApiKeyForPlatformMcp(platformMcpId, userId);
    const apiKey = resolvePlatformMcpApiKey(platformMcpId, userKey);
    if (!apiKey) return { status: 'needs_key', tools: [] };

    const tools: Array<{ name: string; description?: string }> = [];
    for (const server of parsed.servers) {
      const url = expandMcpTemplateString(server.url, {
        OPENKMS_API_URL: resolveOpenkmsApiBaseUrl(),
        USER_API_KEY: apiKey,
      });
      const headers = server.headers
        ? Object.fromEntries(
            Object.entries(server.headers).map(([k, v]) => [
              k,
              expandMcpTemplateString(v, {
                OPENKMS_API_URL: resolveOpenkmsApiBaseUrl(),
                USER_API_KEY: apiKey,
              }),
            ]),
          )
        : undefined;
      const connection = await connectMcpServer(server.name, {
        url,
        transport: server.transport,
        headers,
        ...(isPlatformLoopbackMcp(platformMcpId)
          ? { fetch: createAgentRequestForwardingFetch() }
          : {}),
      });
      try {
        for (const tool of connection.tools) {
          tools.push({
            name: tool.name,
            ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
          });
        }
      } finally {
        await connection.close().catch(() => undefined);
      }
    }
    return { status: 'ok', tools };
  } catch (err) {
    return {
      status: 'error',
      tools: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function createDatasourceForwardingFetch(datasourceId: string): typeof fetch {
  return async (input, init) => {
    const ctx = getAgentRequestContext();
    const headers = new Headers(init?.headers);
    if (ctx?.authorization) {
      headers.set('authorization', ctx.authorization);
    }
    if (ctx?.openkmsApiKey) {
      headers.set('x-openkms-api-key', ctx.openkmsApiKey);
    }
    if (ctx?.instanceId) {
      headers.set('x-flue-instance-id', ctx.instanceId);
    }
    headers.set(DATASOURCE_ID_HEADER, datasourceId);
    return fetch(input, { ...init, headers });
  };
}

function datasourceMcpPath(type: string): string {
  if (type === 'postgres') return '/api/mcp/postgres';
  if (type === 'mysql') return '/api/mcp/mysql';
  throw new Error(`Unsupported datasource type "${type}"`);
}

async function connectDatasourcesByIds(
  specId: string,
  userId: string,
  ids: string[],
): Promise<ToolDefinition[]> {
  if (ids.length === 0) return [];

  const cacheKey = `${specId}::${userId}::ds::${[...new Set(ids)].sort().join(',')}`;
  let connections = connectionCache.get(cacheKey);
  if (!connections) {
    connections = [];
    const rows = await db
      .select({
        id: appUserDatasources.id,
        name: appUserDatasources.name,
        type: appUserDatasources.type,
      })
      .from(appUserDatasources)
      .where(
        and(eq(appUserDatasources.createdBy, userId), inArray(appUserDatasources.id, ids)),
      );

    const rowById = new Map(rows.map((row) => [row.id, row]));
    for (const datasourceId of ids) {
      const row = rowById.get(datasourceId);
      if (!row) continue;
      const url = `${resolveOpenkmsApiBaseUrl()}${datasourceMcpPath(row.type)}`;
      try {
        connections.push(
          await connectMcpServer(row.name, {
            url,
            transport: 'streamable-http',
            fetch: createDatasourceForwardingFetch(datasourceId),
          }),
        );
      } catch (error) {
        console.warn(
          `[mcp] datasource "${row.name}" (${datasourceId}) unavailable:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    connectionCache.set(cacheKey, connections);
  }

  const tools: ToolDefinition[] = [];
  for (const connection of connections) {
    tools.push(...filterMcpTools(connection, undefined));
  }
  return tools;
}

async function connectStudioDatasources(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  const ids = spec.studioMeta?.datasourceIds ?? [];
  const userId = getAgentRequestContext()?.userId;
  if (!userId || ids.length === 0) return [];
  return connectDatasourcesByIds(spec.id, userId, ids);
}

async function connectFsAgentDatasources(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  const names = spec.datasourceNames ?? [];
  const userId = getAgentRequestContext()?.userId;
  if (!userId || names.length === 0) return [];
  const ids = await listDatasourceIdsByNamesForUser(userId, names);
  if (ids.length === 0) {
    console.warn(
      `[mcp] agent "${spec.id}" datasourceNames not found for user: ${names.join(', ')}`,
    );
    return [];
  }
  return connectDatasourcesByIds(spec.id, userId, ids);
}

async function connectStudioPlatformMcp(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  const ids = spec.studioMeta?.platformMcpIds ?? [];
  if (ids.length === 0) return [];

  const userId = getAgentRequestContext()?.userId;
  const cacheKey = `${spec.id}::${userId ?? 'anon'}`;
  let connections = connectionCache.get(cacheKey);
  if (!connections) {
    connections = [];
    for (const platformMcpId of ids) {
      const template = loadPlatformMcpTemplate(platformMcpId);
      const parsed = parseMcpServersJson({ mcpServers: template.mcpServers });
      if (!parsed.ok) throw new Error(parsed.error);
      const userKey = await userApiKeyForPlatformMcp(platformMcpId, userId);
      const apiKey = resolvePlatformMcpApiKey(platformMcpId, userKey);
      if (!apiKey) {
        throw new Error(
          `Missing MCP credentials for "${platformMcpId}". Save your key in Asset Market.`,
        );
      }
      for (const server of parsed.servers) {
        const url = expandMcpTemplateString(server.url, {
          OPENKMS_API_URL: resolveOpenkmsApiBaseUrl(),
          USER_API_KEY: apiKey,
        });
        const headers = server.headers
          ? Object.fromEntries(
              Object.entries(server.headers).map(([k, v]) => [
                k,
                expandMcpTemplateString(v, {
                  OPENKMS_API_URL: resolveOpenkmsApiBaseUrl(),
                  USER_API_KEY: apiKey,
                }),
              ]),
            )
          : undefined;
        connections.push(
          await connectMcpServer(server.name, {
            url,
            transport: server.transport,
            headers,
            ...(isPlatformLoopbackMcp(platformMcpId)
              ? { fetch: createAgentRequestForwardingFetch() }
              : {}),
          }),
        );
      }
    }
    connectionCache.set(cacheKey, connections);
  }

  const tools: ToolDefinition[] = [];
  for (const connection of connections) {
    // Industry practice: MCP config has no tool allowlist — expose tools discovered at connect.
    // Agent-level allowTools (yaml `mcp[].allowTools`) still applies for filesystem agents below.
    tools.push(...filterMcpTools(connection, undefined));
  }
  return tools;
}

export async function connectAgentMcpTools(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  if (spec.source === 'studio') {
    const [platform, datasources] = await Promise.all([
      connectStudioPlatformMcp(spec),
      connectStudioDatasources(spec),
    ]);
    return [...platform, ...datasources];
  }
  const [mcpTools, datasourceTools] = await Promise.all([
    (async () => {
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
    })(),
    connectFsAgentDatasources(spec),
  ]);
  return [...mcpTools, ...datasourceTools];
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
