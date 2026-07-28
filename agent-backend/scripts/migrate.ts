import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool, closePool } from '../src/db/pool.ts';

async function main() {
  const db = drizzle(getPool());
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Drizzle migrations applied.');
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
