import './load-env.ts';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { syncRbac } from '../src/db/sync-rbac.ts';
import { getPool, closePool } from '../src/db/pool.ts';
import { validateMigrations } from './validate-migrations.ts';

async function main() {
  validateMigrations();
  const db = drizzle(getPool());
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Drizzle migrations applied.');
  await syncRbac();
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
