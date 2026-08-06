import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DatasourceType } from './constants.ts';
import {
  mysqlDescribeTable,
  mysqlExecuteSql,
  mysqlListTables,
} from './mysql-executor.ts';
import {
  postgresDescribeTable,
  postgresExecuteSql,
  postgresListTables,
} from './postgres-executor.ts';
import type { UserDatasource } from './types.ts';

export function createDatabaseMcpServer(
  source: UserDatasource,
  engine: DatasourceType,
): McpServer {
  const server = new McpServer({
    name: engine,
    version: '1.0.0',
  });

  server.registerTool(
    'list_tables',
    {
      title: 'List tables',
      description: 'List user tables in the connected database (schemas and names).',
      inputSchema: {},
    },
    async () => {
      const text =
        engine === 'postgres'
          ? await postgresListTables(source)
          : await mysqlListTables(source);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'describe_table',
    {
      title: 'Describe table',
      description: 'List columns for a table. Use schema.table when needed.',
      inputSchema: {
        table: z.string().min(1).describe('Table name, optionally schema.table'),
      },
    },
    async (input) => {
      const text =
        engine === 'postgres'
          ? await postgresDescribeTable(source, input.table)
          : await mysqlDescribeTable(source, input.table);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'execute_sql',
    {
      title: 'Execute SQL',
      description:
        'Run a read-only SQL query against this datasource. SELECT/WITH/SHOW/EXPLAIN only; results are row-limited.',
      inputSchema: {
        sql: z.string().min(1).describe('Single read-only SQL statement'),
      },
    },
    async (input) => {
      const text =
        engine === 'postgres'
          ? await postgresExecuteSql(source, input.sql)
          : await mysqlExecuteSql(source, input.sql);
      return { content: [{ type: 'text', text }] };
    },
  );

  return server;
}
