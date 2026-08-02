import { Hono } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { appUserApiKeys, db } from '../db/index.ts';
import {
  apiKeyLookupPrefix,
  generateApiKeyPlaintext,
  hashApiKey,
} from '../auth/api-key.ts';
import { getUser, requireSessionAuth } from '../auth/jwt.ts';

const userApiKeys = new Hono();

userApiKeys.use('*', requireSessionAuth);

userApiKeys.get('/', async (c) => {
  const user = getUser(c);
  const rows = await db
    .select({
      id: appUserApiKeys.id,
      name: appUserApiKeys.name,
      keyPrefix: appUserApiKeys.keyPrefix,
      createdAt: appUserApiKeys.createdAt,
      expiresAt: appUserApiKeys.expiresAt,
      revokedAt: appUserApiKeys.revokedAt,
      lastUsedAt: appUserApiKeys.lastUsedAt,
    })
    .from(appUserApiKeys)
    .where(and(eq(appUserApiKeys.userId, user.id), isNull(appUserApiKeys.revokedAt)))
    .orderBy(desc(appUserApiKeys.createdAt));

  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      key_prefix: row.keyPrefix,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt?.toISOString() ?? null,
      last_used_at: row.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

userApiKeys.post('/', async (c) => {
  const user = getUser(c);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}));
  const name = body.name?.trim() || 'Default';
  if (name.length > 64) return c.json({ error: 'name must be at most 64 characters' }, 400);

  const plaintext = generateApiKeyPlaintext();
  const keyPrefix = apiKeyLookupPrefix(plaintext);
  const keyHash = hashApiKey(plaintext);

  const [row] = await db
    .insert(appUserApiKeys)
    .values({
      userId: user.id,
      name,
      keyPrefix,
      keyHash,
    })
    .returning({
      id: appUserApiKeys.id,
      name: appUserApiKeys.name,
      keyPrefix: appUserApiKeys.keyPrefix,
      createdAt: appUserApiKeys.createdAt,
    });

  if (!row) return c.json({ error: 'Failed to create API key' }, 500);

  return c.json(
    {
      key: plaintext,
      item: {
        id: row.id,
        name: row.name,
        key_prefix: row.keyPrefix,
        created_at: row.createdAt.toISOString(),
      },
    },
    201,
  );
});

userApiKeys.delete('/:id', async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');
  const [row] = await db
    .update(appUserApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(appUserApiKeys.id, id),
        eq(appUserApiKeys.userId, user.id),
        isNull(appUserApiKeys.revokedAt),
      ),
    )
    .returning({ id: appUserApiKeys.id });

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default userApiKeys;
