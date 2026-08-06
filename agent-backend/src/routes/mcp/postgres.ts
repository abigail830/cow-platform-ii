import { Hono } from 'hono';
import { handleDatabaseMcpRequest } from '../../database-mcp/mcp-route-handler.ts';

const postgresMcp = new Hono();

postgresMcp.all('/', async (c) => handleDatabaseMcpRequest(c, 'postgres'));

export default postgresMcp;
