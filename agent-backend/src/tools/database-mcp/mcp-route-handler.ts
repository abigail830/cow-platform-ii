import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Context } from 'hono';
import { resolveHybridSearchMcpUser } from '../hybrid-search/mcp-auth.ts';
import { DATASOURCE_ID_HEADER, type DatasourceType } from './constants.ts';
import { createDatabaseMcpServer } from './create-database-mcp-server.ts';
import { getDatasourceForUser } from './datasource-service.ts';
import { resolveDatabaseMcpAccess } from './mcp-access.ts';

export async function handleDatabaseMcpRequest(
  c: Context,
  engine: DatasourceType,
): Promise<Response> {
  const access = await resolveDatabaseMcpAccess(c.req.raw, engine, {
    resolveUser: resolveHybridSearchMcpUser,
    getSource: getDatasourceForUser,
  });
  if (access.kind === 'unauthorized') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (access.kind === 'missing_datasource_id') {
    return c.json({ error: `Missing ${DATASOURCE_ID_HEADER} header` }, 400);
  }
  if (access.kind === 'not_found') {
    return c.json({ error: 'Datasource not found' }, 404);
  }
  if (access.kind === 'type_mismatch') {
    return c.json({ error: `Datasource type mismatch: expected ${access.expected}` }, 400);
  }

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createDatabaseMcpServer(access.source, engine);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
}
