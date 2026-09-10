import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    const serverless = Boolean(process.env.VERCEL);
    const maxFromEnv = Number(process.env.PG_POOL_MAX?.trim());
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: Number.isFinite(maxFromEnv) && maxFromEnv > 0 ? maxFromEnv : serverless ? 2 : 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: serverless ? 5_000 : 30_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
