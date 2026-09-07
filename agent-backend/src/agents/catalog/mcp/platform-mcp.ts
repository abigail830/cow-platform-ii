import { connectMcpServer, type McpServerConnection, type ToolDefinition } from '@flue/runtime';
import { and, eq } from 'drizzle-orm';
import { expandMcpTemplateString, parseMcpServersJson } from '../../../agent-assets/parse-mcp-servers.ts';
import { loadPlatformMcpTemplate } from '../../../agent-assets/manifest.ts';
import { discoverStaticPlatformMcpTools } from '../../../tools/database-mcp/static-discovery.ts';
import { appUserMcpCredentials, db } from '../../../infrastructure/db/index.ts';
import { createAgentRequestForwardingFetch, getAgentRequestContext } from '../../runtime/agent-request-context.ts';
import { decryptModelConfigApiKey } from '../../../model-config/infrastructure/model-config-secret.ts';
import type { LoadedAgentSpec, McpServerYaml } from '../schema.ts';
import { getMcpConnectionCache } from './connection-cache.ts';
import {
  HYBRID_SEARCH_MCP_API_KEY_ENV,
  PAGEINDEX_SEARCH_MCP_API_KEY_ENV,
  resolveMcpServerHeaders,
  resolveMcpServerUrl,
  resolveOpenkmsApiBaseUrl,
} from './resolve-url.ts';
import { filterMcpTools } from './tool-filter.ts';

const PLATFORM_LOOPBACK_MCP_IDS = new Set(['hybrid-search', 'pageindex-search']);

function isPlatformLoopbackMcp(platformMcpId: string): boolean {
  return PLATFORM_LOOPBACK_MCP_IDS.has(platformMcpId);
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

export async function connectStudioPlatformMcp(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  const ids = spec.studioMeta?.platformMcpIds ?? [];
  if (ids.length === 0) return [];

  const userId = getAgentRequestContext()?.userId;
  const cacheKey = `${spec.id}::${userId ?? 'anon'}`;
  const connectionCache = getMcpConnectionCache();
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
    tools.push(...filterMcpTools(connection, undefined));
  }
  return tools;
}

export async function connectYamlMcpServers(
  spec: LoadedAgentSpec,
): Promise<{ connections: McpServerConnection[]; tools: ToolDefinition[] }> {
  if (!spec.mcp.length) return { connections: [], tools: [] };

  const connectionCache = getMcpConnectionCache();
  let connections = connectionCache.get(spec.id);
  if (!connections) {
    connections = await Promise.all(
      spec.mcp.map((server) => connectYamlMcpServer(server)),
    );
    connectionCache.set(spec.id, connections);
  }

  const tools: ToolDefinition[] = [];
  for (const connection of connections) {
    const serverSpec = spec.mcp.find((entry) => entry.name === connection.name);
    tools.push(...filterMcpTools(connection, serverSpec?.allowTools));
  }
  return { connections, tools };
}

async function connectYamlMcpServer(server: McpServerYaml): Promise<McpServerConnection> {
  return connectMcpServer(server.name, {
    url: resolveMcpServerUrl(server),
    transport: server.transport,
    headers: resolveMcpServerHeaders(server),
    ...(server.useAgentRequestHeaders ? { fetch: createAgentRequestForwardingFetch() } : {}),
  });
}
