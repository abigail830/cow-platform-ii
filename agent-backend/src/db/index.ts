import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from './pool.ts';
import * as schema from './schema.ts';

export const db = drizzle(getPool(), { schema });
export * from './schema.ts';
