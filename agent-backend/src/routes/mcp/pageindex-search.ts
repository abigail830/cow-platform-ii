import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveHybridSearchMcpUser } from '../../hybrid-search/mcp-auth.ts';
import { createPageIndexSearchMcpServer } from '../../mcp/create-pageindex-search-mcp-server.ts';

const pageIndexSearchMcp = new Hono();

pageIndexSearchMcp.all('/', async (c) => {
  const user = await resolveHybridSearchMcpUser(c.req.raw);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createPageIndexSearchMcpServer(user);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default pageIndexSearchMcp;
