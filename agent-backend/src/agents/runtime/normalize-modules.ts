// @ts-nocheck — mirrors Flue-generated server bootstrap; internal types are not exported.
import { assertWorkflowDefinition } from '@flue/runtime/internal';
import type { AgentRouteHandler } from '@flue/runtime';

type AgentModule = {
  default?: {
    __flueAgentDefinition?: boolean;
    initialize?: (...args: never[]) => unknown;
  };
  route?: AgentRouteHandler;
  attachments?: AgentRouteHandler;
  description?: string;
};

export function normalizeBuiltModules(
  agentModules: Record<string, AgentModule>,
  workflowModules: Record<string, { default?: unknown; route?: unknown; runs?: unknown }>,
  channelModules: Record<string, unknown> = {},
) {
  const agents: Array<{
    name: string;
    definition: NonNullable<AgentModule['default']>;
    route?: AgentRouteHandler;
    attachments?: AgentRouteHandler;
    description?: string;
  }> = [];
  const workflows: Array<{
    name: string;
    definition: unknown;
    route?: AgentRouteHandler;
    runs?: AgentRouteHandler;
  }> = [];
  const channelHandlers: Record<string, Record<string, AgentRouteHandler>> = {};

  for (const [name, mod] of Object.entries(agentModules)) {
    if (!mod.default?.__flueAgentDefinition || typeof mod.default.initialize !== 'function') {
      throw new Error(`[flue] Agent "${name}" must default-export defineAgent(...).`);
    }
    if (mod.route !== undefined && typeof mod.route !== 'function') {
      throw new Error(`[flue] Agent "${name}" route export must be middleware.`);
    }
    if (mod.attachments !== undefined && typeof mod.attachments !== 'function') {
      throw new Error(`[flue] Agent "${name}" attachments export must be middleware.`);
    }
    if (
      mod.description !== undefined &&
      (typeof mod.description !== 'string' || mod.description.trim().length === 0)
    ) {
      throw new Error(`[flue] Agent "${name}" description export must be a non-empty string.`);
    }
    const previous = agents.find((agent) => agent.definition === mod.default);
    if (previous) {
      throw new Error(
        `[flue] Agents "${previous.name}" and "${name}" default-export the same agent definition.`,
      );
    }
    const agent = { name, definition: mod.default };
    if (mod.description !== undefined) agent.description = mod.description;
    if (typeof mod.route === 'function') agent.route = mod.route;
    if (typeof mod.attachments === 'function') agent.attachments = mod.attachments;
    agents.push(agent);
  }

  for (const [name, mod] of Object.entries(workflowModules)) {
    assertWorkflowDefinition(mod.default, name);
    if (mod.route !== undefined && typeof mod.route !== 'function') {
      throw new Error(`[flue] Workflow "${name}" route export must be middleware.`);
    }
    if (mod.runs !== undefined && typeof mod.runs !== 'function') {
      throw new Error(`[flue] Workflow "${name}" runs export must be middleware.`);
    }
    const previous = workflows.find((workflow) => workflow.definition === mod.default);
    if (previous) {
      throw new Error(
        `[flue] Workflows "${previous.name}" and "${name}" default-export the same workflow definition.`,
      );
    }
    const workflow = { name, definition: mod.default };
    if (typeof mod.route === 'function') workflow.route = mod.route;
    if (typeof mod.runs === 'function') workflow.runs = mod.runs;
    workflows.push(workflow);
  }

  for (const [name, mod] of Object.entries(channelModules)) {
    const channel = (mod as { channel?: { routes?: Array<{ method?: string; path?: string; handler?: unknown }> } })
      .channel;
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      throw new Error(`[flue] Channel "${name}" must export a created channel as the named "channel" binding.`);
    }
    if (!Array.isArray(channel.routes) || channel.routes.length === 0) {
      throw new Error(`[flue] Channel "${name}" must declare at least one route.`);
    }
    const routes: Record<string, AgentRouteHandler> = {};
    for (const route of channel.routes) {
      if (!route || typeof route !== 'object' || Array.isArray(route)) {
        throw new Error(`[flue] Channel "${name}" contains an invalid route declaration.`);
      }
      if (typeof route.method !== 'string' || !/^[A-Z]+$/.test(route.method)) {
        throw new Error(`[flue] Channel "${name}" route method must contain only uppercase ASCII letters.`);
      }
      if (
        typeof route.path !== 'string' ||
        route.path.length < 2 ||
        !route.path.startsWith('/') ||
        route.path.startsWith('//') ||
        route.path.includes('?') ||
        route.path.includes('#')
      ) {
        throw new Error(
          `[flue] Channel "${name}" route path must be a non-empty absolute suffix without a query or fragment.`,
        );
      }
      if (route.path.split('/').some((segment) => segment === '.' || segment === '..')) {
        throw new Error(`[flue] Channel "${name}" route path must remain beneath its channel namespace.`);
      }
      if (typeof route.handler !== 'function') {
        throw new Error(`[flue] Channel "${name}" route handler must be callable.`);
      }
      const key = `${route.method} ${route.path}`;
      if (routes[key] !== undefined) {
        throw new Error(`[flue] Channel "${name}" declares duplicate route "${key}".`);
      }
      routes[key] = route.handler as AgentRouteHandler;
    }
    channelHandlers[name] = routes;
  }

  return { agents, workflows, channelHandlers };
}
