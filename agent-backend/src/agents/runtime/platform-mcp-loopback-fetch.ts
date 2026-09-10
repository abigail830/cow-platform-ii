import { OPENKMS_API_KEY_HEADER } from '../../auth/openkms-headers.ts';
import { getAgentRequestContext } from './agent-request-context.ts';

const LOOPBACK_PREFIXES = ['/api/mcp/hybrid-search', '/api/mcp/pageindex-search'] as const;

let inProcessFetch: typeof globalThis.fetch | undefined;

/** Register Hono/app fetch for same-process MCP loopback (avoids Vercel self-HTTP deadlock). */
export function registerInProcessMcpFetch(fetchImpl: typeof globalThis.fetch): void {
  inProcessFetch = fetchImpl;
}

export function resetInProcessMcpFetchForTests(): void {
  inProcessFetch = undefined;
}

export function isPlatformMcpLoopbackUrl(raw: string): boolean {
  try {
    const pathname = new URL(raw, 'http://loopback.invalid').pathname.replace(/\/$/, '') || '/';
    return LOOPBACK_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  } catch {
    return false;
  }
}

function mergeAgentAuthHeaders(headers: Headers): void {
  const ctx = getAgentRequestContext();
  if (ctx?.authorization) headers.set('authorization', ctx.authorization);
  if (ctx?.openkmsApiKey) headers.set(OPENKMS_API_KEY_HEADER, ctx.openkmsApiKey);
  if (ctx?.instanceId) headers.set('x-flue-instance-id', ctx.instanceId);
}

/**
 * Fetch for platform MCP clients. Forwards Playground auth headers and routes
 * hybrid-search / pageindex-search through in-process app.fetch when registered.
 */
export function createPlatformMcpFetch(
  baseFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): typeof globalThis.fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    mergeAgentAuthHeaders(headers);

    if (inProcessFetch && isPlatformMcpLoopbackUrl(url)) {
      const target = typeof input === 'string' ? input : input instanceof URL ? input : input.url;
      return inProcessFetch(new Request(target, { ...init, headers }));
    }

    return baseFetch(input, { ...init, headers });
  };
}
