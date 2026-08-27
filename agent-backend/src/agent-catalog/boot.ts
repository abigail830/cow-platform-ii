import { buildAgentModuleFromSpec, primeCatalogSpecs } from './build-agent-module.ts';
import { loadAllAgentSpecs } from './discover.ts';
import { warmCatalogAgentRuntimes } from './resolve-agent-runtime.ts';
import { getAgentRegistry, initAgentRegistry } from './registry.ts';
import { loadStudioAgentRows, studioRowToLoadedSpec } from './studio-spec.ts';
import { refreshModelConfigCache } from '../shared/model/model-registry.ts';

let booted = false;
let bootPromise: Promise<void> | null = null;

async function loadStudioIntoRegistry(): Promise<void> {
  const registry = getAgentRegistry();
  const rows = await loadStudioAgentRows();
  for (const row of rows) {
    try {
      const spec = await studioRowToLoadedSpec(row);
      registry.upsert(spec);
    } catch (error) {
      console.warn(`[agent-catalog] skip studio agent "${row.slug}":`, error);
    }
  }
}

export async function bootAgentCatalogAsync(): Promise<void> {
  if (booted) return;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const specs = loadAllAgentSpecs();
    primeCatalogSpecs(specs);
    initAgentRegistry((spec) => {
      const mod = buildAgentModuleFromSpec(spec);
      return {
        definition: mod.definition,
        route: mod.route,
        attachments: mod.attachments,
      };
    });
    await loadStudioIntoRegistry();
    void Promise.all([
      refreshModelConfigCache(),
      warmCatalogAgentRuntimes(specs),
    ]).catch((error) => {
      console.warn('[agent-catalog] startup warm failed:', error);
    });
    booted = true;
  })();

  try {
    await bootPromise;
  } catch (error) {
    bootPromise = null;
    throw error;
  }
}

/** Sync boot for FS agents; studio rows load in background. Prefer bootAgentCatalogAsync at process start. */
export function bootAgentCatalog(): void {
  if (booted) return;
  const specs = loadAllAgentSpecs();
  primeCatalogSpecs(specs);
  initAgentRegistry((spec) => {
    const mod = buildAgentModuleFromSpec(spec);
    return {
      definition: mod.definition,
      route: mod.route,
      attachments: mod.attachments,
    };
  });
  void Promise.all([
    refreshModelConfigCache(),
    warmCatalogAgentRuntimes(specs),
    loadStudioIntoRegistry().catch((error) => {
      console.warn('[agent-catalog] studio load failed:', error);
    }),
  ]).catch((error) => {
    console.warn('[agent-catalog] startup warm failed:', error);
  });
  booted = true;
}

export function getCatalogFlueAgentModules(): Record<
  string,
  {
    default: ReturnType<typeof buildAgentModuleFromSpec>['definition'];
    route: ReturnType<typeof buildAgentModuleFromSpec>['route'];
    attachments: ReturnType<typeof buildAgentModuleFromSpec>['attachments'];
    description: string;
  }
> {
  bootAgentCatalog();
  return getAgentRegistry().listFlueModules();
}

export async function upsertStudioAgentInRegistry(slug: string): Promise<void> {
  await bootAgentCatalogAsync();
  const { loadStudioAgentRowBySlug } = await import('./studio-spec.ts');
  const { forgetAgentSpec } = await import('./build-agent-module.ts');
  const row = await loadStudioAgentRowBySlug(slug);
  if (!row) {
    forgetAgentSpec(slug);
    getAgentRegistry().remove(slug);
    return;
  }
  const spec = await studioRowToLoadedSpec(row);
  getAgentRegistry().upsert(spec);
}

export function resetAgentCatalogBootForTests(): void {
  booted = false;
  bootPromise = null;
}
