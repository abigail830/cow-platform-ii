import { eq } from 'drizzle-orm';
import { appUsers, db } from '../../db/index.ts';
import { readA2aServiceUserId, A2A_SERVICE_USER_EMAIL } from './config.ts';

let cachedServiceUserId: string | undefined;

export async function getA2aServiceUserId(): Promise<string> {
  const configured = readA2aServiceUserId();
  if (configured) return configured;

  if (cachedServiceUserId) return cachedServiceUserId;

  const [row] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.email, A2A_SERVICE_USER_EMAIL))
    .limit(1);

  if (!row) {
    throw new Error(
      `A2A service user not found (${A2A_SERVICE_USER_EMAIL}). Run npm run seed or set A2A_SERVICE_USER_ID.`,
    );
  }

  cachedServiceUserId = row.id;
  return row.id;
}

export function resetA2aServiceUserCacheForTests(): void {
  cachedServiceUserId = undefined;
}
