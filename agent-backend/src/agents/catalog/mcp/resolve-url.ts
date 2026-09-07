import type { McpServerYaml } from '../schema.ts';

const DEFAULT_HYBRID_SEARCH_MCP_URL_ENV = 'HYBRID_SEARCH_MCP_URL';
export const HYBRID_SEARCH_MCP_API_KEY_ENV = 'HYBRID_SEARCH_MCP_API_KEY';
const DEFAULT_PAGEINDEX_SEARCH_MCP_URL_ENV = 'PAGEINDEX_SEARCH_MCP_URL';
export const PAGEINDEX_SEARCH_MCP_API_KEY_ENV = 'PAGEINDEX_SEARCH_MCP_API_KEY';

export function resolveOpenkmsApiBaseUrl(): string {
  return process.env.OPENKMS_API_URL?.trim()?.replace(/\/$/, '') ?? 'http://127.0.0.1:8787';
}

function resolveHeaders(headersEnv?: Record<string, string>): HeadersInit | undefined {
  if (!headersEnv) return undefined;
  const headers: Record<string, string> = {};
  for (const [header, envName] of Object.entries(headersEnv)) {
    const value = process.env[envName]?.trim();
    if (!value) {
      throw new Error(`Missing MCP header env ${envName} for header ${header}`);
    }
    headers[header] = value;
  }
  return headers;
}

export function resolveMcpServerUrl(server: McpServerYaml): string {
  const internalPath = server.internalPath?.trim();
  if (internalPath) {
    return `${resolveOpenkmsApiBaseUrl()}${internalPath}`;
  }

  const urlEnv = server.urlEnv?.trim();
  if (!urlEnv) {
    throw new Error(`MCP server "${server.name}" requires urlEnv or internalPath`);
  }

  const fromEnv = process.env[urlEnv]?.trim();
  if (fromEnv) return fromEnv;

  if (urlEnv === DEFAULT_HYBRID_SEARCH_MCP_URL_ENV) {
    return `${resolveOpenkmsApiBaseUrl()}/api/mcp/hybrid-search`;
  }
  if (urlEnv === DEFAULT_PAGEINDEX_SEARCH_MCP_URL_ENV) {
    return `${resolveOpenkmsApiBaseUrl()}/api/mcp/pageindex-search`;
  }

  throw new Error(`Missing MCP url env ${urlEnv} for server "${server.name}"`);
}

export function resolveMcpServerHeaders(server: McpServerYaml): HeadersInit | undefined {
  return resolveHeaders(server.headersEnv);
}
