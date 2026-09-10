import { AsyncLocalStorage } from 'node:async_hooks';
import { createPlatformMcpFetch } from './platform-mcp-loopback-fetch.ts';

export type AgentRequestContext = {
  instanceId?: string;
  userId?: string;
  authorization?: string;
  openkmsApiKey?: string;
};

const storage = new AsyncLocalStorage<AgentRequestContext>();

export function runWithAgentRequestContext<T>(
  context: AgentRequestContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(context, fn);
}

export function getAgentRequestContext(): AgentRequestContext | undefined {
  return storage.getStore();
}

/** Forward Playground auth headers when the agent runtime calls loopback MCP. Request headers override static env headers. */
export function createAgentRequestForwardingFetch(): typeof fetch {
  return createPlatformMcpFetch();
}
