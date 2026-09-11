import { OPENKMS_API_KEY_HEADER } from '../../auth/openkms-headers.ts';
import { isApiKeyToken } from '../../auth/api-key.ts';
import { resolveUserFromApiKey } from '../../auth/resolve-user-api-key.ts';
import { verifyToken, type AuthUser } from '../../auth/jwt.ts';

/** Resolve caller for hybrid-search MCP (Bearer JWT/okf_ key or x-openkms-api-key header). */
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

  return null;
}
