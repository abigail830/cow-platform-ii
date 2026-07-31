import { defineAgent } from '@flue/runtime';
import { agentAccessRoute } from '../auth/agent-route.ts';
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

function ensureCatalogSpecsPrimed(): void {
  if (specById.size > 0) return;
  primeCatalogSpecs(loadAllAgentSpecs());
}

function getSpec(agentId: string): LoadedAgentSpec {
  ensureCatalogSpecsPrimed();
  const spec = specById.get(agentId);
  if (!spec) {
    throw new Error(`Unknown catalog agent "${agentId}". Run npm run catalog:sync.`);
  }
  return spec;
}

export function buildCatalogAgentModule(agentId: string) {
  const spec = getSpec(agentId);

  const definition = defineAgent(async () => resolveCatalogAgentRuntime(spec));

  return {
    definition,
    route: agentAccessRoute(spec.id),
    description: spec.description,
  };
}

export function buildCatalogAgentExports(agentId: string) {
  return buildCatalogAgentModule(agentId);
}
