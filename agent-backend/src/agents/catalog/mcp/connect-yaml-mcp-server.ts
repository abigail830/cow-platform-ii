import { connectMcpServer, type McpServerConnection } from '@flue/runtime';
import { createAgentRequestForwardingFetch } from '../../runtime/agent-request-context.ts';
import type { McpServerYaml } from '../schema.ts';
import { resolveMcpServerHeaders, resolveMcpServerUrl } from './resolve-url.ts';

export async function connectYamlMcpServer(server: McpServerYaml): Promise<McpServerConnection> {
  return connectMcpServer(server.name, {
    url: resolveMcpServerUrl(server),
    transport: server.transport,
    headers: resolveMcpServerHeaders(server),
    ...(server.useAgentRequestHeaders ? { fetch: createAgentRequestForwardingFetch() } : {}),
  });
}
