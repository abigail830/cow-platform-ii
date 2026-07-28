import 'dotenv/config';
import { syncRbac } from '../src/db/sync-rbac.ts';
import { closePool } from '../src/db/pool.ts';

async function main() {
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
