import type { AgentDefinition } from '@flue/runtime';
import type { AgentRouteHandler } from '@flue/runtime';
import { loadAllAgentSpecs } from './discover.ts';
import type { LoadedAgentSpec } from './schema.ts';

export type AgentCatalogEntry = {
  spec: LoadedAgentSpec;
  definition: AgentDefinition;
  route: AgentRouteHandler;
  attachments: AgentRouteHandler;
};

export type AgentPublicMeta = {
  id: string;
  displayName: string;
  description: string;
  icon?: string;
};

export class AgentRegistry {
  private readonly entries = new Map<string, AgentCatalogEntry>();

  constructor(
    private readonly buildModule: (spec: LoadedAgentSpec) => Omit<AgentCatalogEntry, 'spec'>,
  ) {}

  loadFromDisk(): void {
    this.entries.clear();
    for (const spec of loadAllAgentSpecs()) {
      const built = this.buildModule(spec);
      this.entries.set(spec.id, { spec, ...built });
    }
  }

  get(id: string): AgentCatalogEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  listIds(): string[] {
    return [...this.entries.keys()].sort();
  }

  listPublicMeta(): AgentPublicMeta[] {
    return this.listIds().map((id) => {
      const spec = this.entries.get(id)!.spec;
      return {
        id: spec.id,
        displayName: spec.displayName,
        description: spec.description,
        icon: spec.icon,
      };
    });
  }

  listFlueModules(): Record<
    string,
    {
      default: AgentDefinition;
      route: AgentRouteHandler;
      attachments: AgentRouteHandler;
      description: string;
    }
  > {
    const modules: Record<
      string,
      {
        default: AgentDefinition;
        route: AgentRouteHandler;
        attachments: AgentRouteHandler;
        description: string;
      }
    > = {};
    for (const [id, entry] of this.entries) {
      modules[id] = {
        default: entry.definition,
        route: entry.route,
        attachments: entry.attachments,
        description: entry.spec.description,
      };
    }
    return modules;
  }
}

let registry: AgentRegistry | null = null;

export function initAgentRegistry(
  buildModule: (spec: LoadedAgentSpec) => Omit<AgentCatalogEntry, 'spec'>,
): AgentRegistry {
  registry = new AgentRegistry(buildModule);
  registry.loadFromDisk();
  return registry;
}

export function getAgentRegistry(): AgentRegistry {
  if (!registry) {
    throw new Error('Agent registry is not initialized. Call bootAgentCatalog() during startup.');
  }
  return registry;
}

export function resetAgentRegistryForTests(): void {
  registry = null;
}
