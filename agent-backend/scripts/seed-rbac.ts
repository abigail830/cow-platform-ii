import './load-env.ts';
import { syncRbac } from '../src/infrastructure/db/sync-rbac.ts';
import { closePool } from '../src/infrastructure/db/pool.ts';

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
