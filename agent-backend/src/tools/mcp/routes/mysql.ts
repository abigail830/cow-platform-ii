import { Hono } from 'hono';
import { handleDatabaseMcpRequest } from '../../database-mcp/mcp-route-handler.ts';

const mysqlMcp = new Hono();

mysqlMcp.all('/', async (c) => handleDatabaseMcpRequest(c, 'mysql'));

export default mysqlMcp;
