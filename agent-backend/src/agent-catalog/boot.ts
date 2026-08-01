import { loadAllAgentSpecs } from './discover.ts';
import { buildCatalogAgentModule, primeCatalogSpecs } from './build-agent-module.ts';
import { warmCatalogAgentRuntimes } from './resolve-agent-runtime.ts';
import { getAgentRegistry, initAgentRegistry } from './registry.ts';
import { refreshModelConfigCache } from '../shared/model-registry.ts';

let booted = false;

export function bootAgentCatalog(): void {
  if (booted) return;
  const specs = loadAllAgentSpecs();
  primeCatalogSpecs(specs);
  initAgentRegistry((spec) => {
    const mod = buildCatalogAgentModule(spec.id);
    return {
      definition: mod.definition,
      route: mod.route,
      attachments: mod.attachments,
    };
  });
  void Promise.all([
    refreshModelConfigCache(),
    warmCatalogAgentRuntimes(specs),
  ]).catch((error) => {
    console.warn('[agent-catalog] startup warm failed:', error);
  });
  booted = true;
}

export function getCatalogFlueAgentModules(): Record<
  string,
  {
    default: ReturnType<typeof buildCatalogAgentModule>['definition'];
    route: ReturnType<typeof buildCatalogAgentModule>['route'];
    attachments: ReturnType<typeof buildCatalogAgentModule>['attachments'];
    description: string;
  }
> {
  bootAgentCatalog();
  return getAgentRegistry().listFlueModules();
}

export function resetAgentCatalogBootForTests(): void {
  booted = false;
}
