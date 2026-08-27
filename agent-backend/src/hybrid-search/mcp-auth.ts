import { eq } from 'drizzle-orm';
import { appUsers, db } from '../db/index.ts';
import { OPENKMS_API_KEY_HEADER } from '../auth/openkms-headers.ts';
import { isApiKeyToken } from '../auth/api-key.ts';
import { resolveUserFromApiKey } from '../auth/resolve-user-api-key.ts';
import { verifyToken, type AuthUser } from '../auth/jwt.ts';
import { decodeUserIdFromInstanceId } from '../shared/model/agent-instance-id.ts';

async function resolveUserById(userId: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      displayName: appUsers.displayName,
      role: appUsers.role,
    })
    .from(appUsers)
    .where(eq(appUsers.id, userId));

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as AuthUser['role'],
  };
}

/** Resolve caller for hybrid-search MCP (Bearer JWT/okf_ key, API key header, or Flue instance id). */
export async function resolveHybridSearchMcpUser(request: Request): Promise<AuthUser | null> {
  const token = (() => {
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim();
  })();

  if (token) {
    if (isApiKeyToken(token)) {
      return await resolveUserFromApiKey(token);
    }
    try {
      return verifyToken(token);
    } catch {
      return null;
    }
  }

  const apiKeyHeader = request.headers.get(OPENKMS_API_KEY_HEADER)?.trim();
  if (apiKeyHeader) {
    const user = await resolveUserFromApiKey(apiKeyHeader);
    if (user) return user;
  }

  const instanceId = request.headers.get('x-flue-instance-id')?.trim();
  if (instanceId) {
    const userId = decodeUserIdFromInstanceId(instanceId);
    if (userId) return await resolveUserById(userId);
  }

  return null;
}
