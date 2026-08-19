import './load-env.ts';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { syncRbac } from '../src/db/sync-rbac.ts';
import { seedBuiltinAgents } from '../src/builtin-agents/seed-builtin-agents.ts';
import { seedPlatformSkillsFromAssets } from '../src/services/skills/skills.ts';
import { getPool, closePool } from '../src/db/pool.ts';
import { validateMigrations } from './validate-migrations.ts';
import { reencryptLegacyModelApiKeys } from './reencrypt-legacy-model-api-keys.ts';

async function main() {
  validateMigrations();
  const db = drizzle(getPool());
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Drizzle migrations applied.');
  const sealedKeys = await reencryptLegacyModelApiKeys();
  if (sealedKeys > 0) {
    console.log(`Sealed ${sealedKeys} legacy plaintext model API key(s).`);
  }
  await syncRbac();
  await seedBuiltinAgents();
  const seededSkills = await seedPlatformSkillsFromAssets();
  if (seededSkills > 0) {
    console.log(`Seeded ${seededSkills} platform skill(s).`);
  }
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
