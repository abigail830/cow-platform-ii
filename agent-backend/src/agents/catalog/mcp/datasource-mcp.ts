import { connectMcpServer, type ToolDefinition } from '@flue/runtime';
import { and, eq, inArray } from 'drizzle-orm';
import { DATASOURCE_ID_HEADER } from '../../../tools/database-mcp/constants.ts';
import { listDatasourceIdsByNamesForUser } from '../../../tools/database-mcp/datasource-service.ts';
import { appUserDatasources, db } from '../../../infrastructure/db/index.ts';
import { getAgentRequestContext } from '../../runtime/agent-request-context.ts';
import type { LoadedAgentSpec } from '../schema.ts';
import { getMcpConnectionCache } from './connection-cache.ts';
import { resolveOpenkmsApiBaseUrl } from './resolve-url.ts';
import { filterMcpTools } from './tool-filter.ts';

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
  const connectionCache = getMcpConnectionCache();
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

export async function connectStudioDatasources(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  const ids = spec.studioMeta?.datasourceIds ?? [];
  const userId = getAgentRequestContext()?.userId;
  if (!userId || ids.length === 0) return [];
  return connectDatasourcesByIds(spec.id, userId, ids);
}

export async function connectFsAgentDatasources(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
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
