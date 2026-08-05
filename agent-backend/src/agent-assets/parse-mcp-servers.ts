/**
 * Parse Cursor/Claude-compatible mcpServers JSON into Flue remote connection configs.
 *
 * Industry shape (Cursor / Claude Code / Claude Desktop): only connection fields under
 * `mcpServers` — no title/description/allowTools in this file. Stdio (`command`) is
 * rejected here because Flue currently supports remote URL MCP only.
 */

export type ParsedRemoteMcpServer = {
  name: string;
  url: string;
  transport: 'streamable-http' | 'sse';
  headers?: Record<string, string>;
  allowTools?: string[];
};

export type ParseMcpServersResult =
  | { ok: true; servers: ParsedRemoteMcpServer[] }
  | { ok: false; error: string };

function inferTransport(name: string, entry: Record<string, unknown>): 'streamable-http' | 'sse' {
  const explicit = entry.transport ?? entry.type;
  if (explicit === 'sse' || explicit === 'streamable-http') return explicit;
  if (typeof entry.url === 'string' && /sse/i.test(entry.url)) return 'sse';
  if (/sse/i.test(name)) return 'sse';
  return 'streamable-http';
}

export function parseMcpServersJson(
  input: unknown,
  options?: { allowToolsByName?: Record<string, string[]> },
): ParseMcpServersResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Root must be an object with mcpServers' };
  }
  const root = input as Record<string, unknown>;
  const mcpServers = root.mcpServers;
  if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    return { ok: false, error: 'Root must include mcpServers object' };
  }

  const servers: ParsedRemoteMcpServer[] = [];
  for (const [name, value] of Object.entries(mcpServers as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: `mcpServers["${name}"] must be an object` };
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.command === 'string') {
      return {
        ok: false,
        error: `mcpServers["${name}"] uses stdio (command) which is not supported; use a remote url`,
      };
    }
    if (typeof entry.url !== 'string' || !entry.url.trim()) {
      return { ok: false, error: `mcpServers["${name}"] requires a remote url` };
    }

    const headers =
      entry.headers && typeof entry.headers === 'object' && !Array.isArray(entry.headers)
        ? Object.fromEntries(
            Object.entries(entry.headers as Record<string, unknown>).filter(
              (pair): pair is [string, string] => typeof pair[1] === 'string',
            ),
          )
        : undefined;

    servers.push({
      name,
      url: entry.url.trim(),
      transport: inferTransport(name, entry),
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(options?.allowToolsByName?.[name] ? { allowTools: options.allowToolsByName[name] } : {}),
    });
  }

  if (servers.length === 0) {
    return { ok: false, error: 'mcpServers is empty' };
  }
  return { ok: true, servers };
}

/** Substitute ${ENV} and ${USER_API_KEY} placeholders in template strings. */
export function expandMcpTemplateString(
  value: string,
  env: Record<string, string | undefined>,
): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => env[key] ?? '');
}
