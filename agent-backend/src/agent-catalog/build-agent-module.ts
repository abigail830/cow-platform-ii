import { defineAgent } from '@flue/runtime';
import { agentAccessRoute, agentAttachmentsRoute } from '../auth/agent-route.ts';
import { loadAllAgentSpecs } from './discover.ts';
import { resolveCatalogAgentRuntime } from './resolve-agent-runtime.ts';
import type { LoadedAgentSpec } from './schema.ts';

const specById = new Map<string, LoadedAgentSpec>();

export function primeCatalogSpecs(specs: LoadedAgentSpec[]): void {
  specById.clear();
  for (const spec of specs) {
    specById.set(spec.id, spec);
  }
}

export function rememberAgentSpec(spec: LoadedAgentSpec): void {
  specById.set(spec.id, spec);
}

export function forgetAgentSpec(agentId: string): void {
  specById.delete(agentId);
}

function ensureCatalogSpecsPrimed(): void {
  if (specById.size > 0) return;
  primeCatalogSpecs(loadAllAgentSpecs());
}

export function getAgentSpec(agentId: string): LoadedAgentSpec {
  ensureCatalogSpecsPrimed();
  const spec = specById.get(agentId);
  if (!spec) {
    throw new Error(`Unknown agent "${agentId}"`);
  }
  return spec;
}

export function buildAgentModuleFromSpec(spec: LoadedAgentSpec) {
  rememberAgentSpec(spec);
  // Capture by id so Save/upsert that calls rememberAgentSpec is visible on next initialize.
  const agentId = spec.id;
  const definition = defineAgent(async () => resolveCatalogAgentRuntime(getAgentSpec(agentId)));

  return {
    definition,
    route: agentAccessRoute(agentId),
    attachments: agentAttachmentsRoute(agentId),
    description: spec.description,
  };
}

export function buildCatalogAgentModule(agentId: string) {
  return buildAgentModuleFromSpec(getAgentSpec(agentId));
}

export function buildCatalogAgentExports(agentId: string) {
  return buildCatalogAgentModule(agentId);
}
