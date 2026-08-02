import { and, eq, isNull } from 'drizzle-orm';
import { appUserApiKeys, appUsers, db } from '../db/index.ts';
import type { AuthUser } from './jwt.ts';
import {
  apiKeyLookupPrefix,
  isApiKeyToken,
  verifyApiKeyHash,
} from './api-key.ts';

export async function resolveUserFromApiKey(token: string): Promise<AuthUser | null> {
  if (!isApiKeyToken(token)) return null;

  const keyPrefix = apiKeyLookupPrefix(token);
  const rows = await db
    .select({
      id: appUserApiKeys.id,
      keyHash: appUserApiKeys.keyHash,
      expiresAt: appUserApiKeys.expiresAt,
      revokedAt: appUserApiKeys.revokedAt,
      userId: appUsers.id,
      email: appUsers.email,
      displayName: appUsers.displayName,
      role: appUsers.role,
    })
    .from(appUserApiKeys)
    .innerJoin(appUsers, eq(appUserApiKeys.userId, appUsers.id))
    .where(and(eq(appUserApiKeys.keyPrefix, keyPrefix), isNull(appUserApiKeys.revokedAt)));

  const now = Date.now();
  for (const row of rows) {
    if (row.revokedAt) continue;
    if (row.expiresAt && row.expiresAt.getTime() <= now) continue;
    if (!verifyApiKeyHash(token, row.keyHash)) continue;

    void db
      .update(appUserApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(appUserApiKeys.id, row.id));

    return {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      role: row.role as AuthUser['role'],
    };
  }

  return null;
}
