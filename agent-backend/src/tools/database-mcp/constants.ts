export const DATASOURCE_ID_HEADER = 'x-datasource-id';

export const PLATFORM_DATASOURCE_MCP_IDS = ['postgres', 'mysql'] as const;

export const DATABASE_MCP_STATIC_TOOLS = [
  {
    name: 'list_tables',
    description: 'List user tables in the connected database (schemas and names).',
  },
  {
    name: 'describe_table',
    description: 'List columns for a table. Use schema.table when needed.',
  },
  {
    name: 'execute_sql',
    description:
      'Run a read-only SQL query against this datasource. SELECT/WITH/SHOW/EXPLAIN only; results are row-limited.',
  },
] as const;

export type DatasourceType = 'postgres' | 'mysql';

export const DEFAULT_MAX_ROWS = 100;
export const MAX_MAX_ROWS = 1000;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
export const MAX_RESULT_BYTES = 512_000;
