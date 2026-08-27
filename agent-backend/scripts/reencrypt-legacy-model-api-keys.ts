import './load-env.ts';
import { pathToFileURL } from 'node:url';
import { eq, isNotNull } from 'drizzle-orm';
import { appModelConfigs, db } from '../src/db/index.ts';
import { closePool } from '../src/db/pool.ts';
import {
  encryptModelConfigApiKey,
  isEncryptedStoredModelApiKey,
} from '../src/shared/model/model-config-secret.ts';

/** One-time data migration: seal legacy plaintext model API keys in DB. */
export async function reencryptLegacyModelApiKeys(): Promise<number> {
  const rows = await db
    .select({ id: appModelConfigs.id, apiKey: appModelConfigs.apiKey })
    .from(appModelConfigs)
    .where(isNotNull(appModelConfigs.apiKey));

  let updated = 0;
  for (const row of rows) {
    const stored = row.apiKey?.trim();
    if (!stored || isEncryptedStoredModelApiKey(stored)) continue;
    await db
      .update(appModelConfigs)
      .set({
        apiKey: encryptModelConfigApiKey(stored),
        updatedAt: new Date(),
      })
      .where(eq(appModelConfigs.id, row.id));
    updated += 1;
  }
  return updated;
}

async function main() {
  const count = await reencryptLegacyModelApiKeys();
  console.log(`Sealed ${count} legacy plaintext model API key(s).`);
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .then(async () => {
      await closePool();
    })
    .catch(async (error) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
