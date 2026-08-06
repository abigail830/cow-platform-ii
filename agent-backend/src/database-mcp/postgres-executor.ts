import { Pool as PgPool, type PoolClient } from 'pg';
import type { UserDatasource } from './types.ts';
import { assertReadOnlySql } from './sql-guard.ts';
import { MAX_RESULT_BYTES } from './constants.ts';

type PgPoolEntry = { pool: PgPool; key: string };

const pgPools = new Map<string, PgPoolEntry>();

function poolKey(userId: string, sourceId: string): string {
  return `${userId}::${sourceId}`;
}

function createPgPool(source: UserDatasource): PgPool {
  return new PgPool({
    host: source.host,
    port: source.port,
    user: source.username,
    password: source.password,
    database: source.database,
    ssl: source.ssl ? { rejectUnauthorized: true } : undefined,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

function getPgPool(source: UserDatasource): PgPool {
  const key = poolKey(source.createdBy, source.id);
  let entry = pgPools.get(key);
  if (!entry) {
    entry = { pool: createPgPool(source), key };
    pgPools.set(key, entry);
  }
  return entry.pool;
}

function truncateRows(rows: unknown[], maxRows: number): { rows: unknown[]; truncated: boolean } {
  if (rows.length <= maxRows) return { rows, truncated: false };
  return { rows: rows.slice(0, maxRows), truncated: true };
}

function enforceResultBytes(payload: unknown): string {
  let text = JSON.stringify(payload);
  if (Buffer.byteLength(text, 'utf8') <= MAX_RESULT_BYTES) return text;
  const slim = { truncated: true, message: 'Result exceeded size limit; reduce max_rows or narrow the query.' };
  return JSON.stringify(slim);
}

async function withPgClient<T>(
  source: UserDatasource,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPgPool(source);
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${Math.max(1, source.statementTimeoutMs)}`);
    if (source.readonly) {
      await client.query('BEGIN READ ONLY');
    }
    const result = await fn(client);
    if (source.readonly) {
      await client.query('COMMIT');
    }
    return result;
  } catch (error) {
    if (source.readonly) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function postgresListTables(source: UserDatasource): Promise<string> {
  const rows = await withPgClient(source, async (client) => {
    const res = await client.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name
       LIMIT 500`,
    );
    return res.rows;
  });
  return enforceResultBytes({ tables: rows });
}

export async function postgresDescribeTable(
  source: UserDatasource,
  table: string,
): Promise<string> {
  const parts = table.split('.');
  const tableName = parts.length === 2 ? parts[1]! : parts[0]!;
  const schemaName = parts.length === 2 ? parts[0]! : 'public';
  const rows = await withPgClient(source, async (client) => {
    const res = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schemaName, tableName],
    );
    return res.rows;
  });
  return enforceResultBytes({ schema: schemaName, table: tableName, columns: rows });
}

export async function postgresExecuteSql(source: UserDatasource, sql: string): Promise<string> {
  if (source.readonly) assertReadOnlySql(sql);
  const rows = await withPgClient(source, async (client) => {
    const res = await client.query(sql);
    return res.rows as unknown[];
  });
  const { rows: limited, truncated } = truncateRows(rows, source.maxRows);
  return enforceResultBytes({ rows: limited, truncated, rowCount: limited.length });
}

export function resetDatabasePoolsForTests(): void {
  for (const entry of pgPools.values()) {
    void entry.pool.end().catch(() => undefined);
  }
  pgPools.clear();
}
