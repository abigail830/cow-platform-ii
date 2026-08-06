import mysql from 'mysql2/promise';
import type { UserDatasource } from './types.ts';
import { assertReadOnlySql } from './sql-guard.ts';
import { MAX_RESULT_BYTES } from './constants.ts';

type MysqlPool = mysql.Pool;

const mysqlPools = new Map<string, MysqlPool>();

function poolKey(userId: string, sourceId: string): string {
  return `${userId}::${sourceId}`;
}

function getMysqlPool(source: UserDatasource): MysqlPool {
  const key = poolKey(source.createdBy, source.id);
  let pool = mysqlPools.get(key);
  if (!pool) {
    pool = mysql.createPool({
      host: source.host,
      port: source.port,
      user: source.username,
      password: source.password,
      database: source.database,
      ssl: source.ssl ? {} : undefined,
      connectionLimit: 3,
      waitForConnections: true,
    });
    mysqlPools.set(key, pool);
  }
  return pool;
}

function truncateRows(rows: unknown[], maxRows: number): { rows: unknown[]; truncated: boolean } {
  if (rows.length <= maxRows) return { rows, truncated: false };
  return { rows: rows.slice(0, maxRows), truncated: true };
}

function enforceResultBytes(payload: unknown): string {
  let text = JSON.stringify(payload);
  if (Buffer.byteLength(text, 'utf8') <= MAX_RESULT_BYTES) return text;
  return JSON.stringify({
    truncated: true,
    message: 'Result exceeded size limit; reduce max_rows or narrow the query.',
  });
}

async function withMysqlConnection<T>(
  source: UserDatasource,
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const pool = getMysqlPool(source);
  const conn = await pool.getConnection();
  try {
    await conn.query(`SET SESSION max_execution_time = ?`, [source.statementTimeoutMs]);
    if (source.readonly) {
      await conn.query('START TRANSACTION READ ONLY');
    }
    const result = await fn(conn);
    if (source.readonly) {
      await conn.query('COMMIT');
    }
    return result;
  } catch (error) {
    if (source.readonly) {
      await conn.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlListTables(source: UserDatasource): Promise<string> {
  const [rows] = await withMysqlConnection(source, async (conn) =>
    conn.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
       ORDER BY table_schema, table_name
       LIMIT 500`,
    ),
  );
  return enforceResultBytes({ tables: rows });
}

export async function mysqlDescribeTable(source: UserDatasource, table: string): Promise<string> {
  const parts = table.split('.');
  const tableName = parts.length === 2 ? parts[1]! : parts[0]!;
  const schemaName = parts.length === 2 ? parts[0]! : source.database;
  const [rows] = await withMysqlConnection(source, async (conn) =>
    conn.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [schemaName, tableName],
    ),
  );
  return enforceResultBytes({ schema: schemaName, table: tableName, columns: rows });
}

export async function mysqlExecuteSql(source: UserDatasource, sql: string): Promise<string> {
  if (source.readonly) assertReadOnlySql(sql);
  const [rows] = await withMysqlConnection(source, async (conn) => conn.query(sql));
  const asArray = Array.isArray(rows) ? (rows as unknown[]) : [rows];
  const { rows: limited, truncated } = truncateRows(asArray, source.maxRows);
  return enforceResultBytes({ rows: limited, truncated, rowCount: limited.length });
}

export function resetMysqlPoolsForTests(): void {
  for (const pool of mysqlPools.values()) {
    void pool.end().catch(() => undefined);
  }
  mysqlPools.clear();
}
