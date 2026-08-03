import { AsyncLocalStorage } from 'node:async_hooks';

export type AgentRequestContext = {
  instanceId?: string;
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
  return async (input, init) => {
    const ctx = getAgentRequestContext();
    const headers = new Headers(init?.headers);
    if (ctx?.authorization) {
      headers.set('authorization', ctx.authorization);
    }
    if (ctx?.openkmsApiKey) {
      headers.set('x-openkms-api-key', ctx.openkmsApiKey);
    }
    if (ctx?.instanceId) {
      headers.set('x-flue-instance-id', ctx.instanceId);
    }
    return fetch(input, { ...init, headers });
  };
}
