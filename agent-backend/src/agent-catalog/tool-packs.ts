import type { ToolDefinition } from '@flue/runtime';
import { createOkfTools } from '../shared/okf-tools.ts';
import { isOkfToolPack, type NormalizedToolPackRef } from './tool-pack-schema.ts';
import type { LoadedAgentSpec } from './schema.ts';

type PackFactory = (spec: LoadedAgentSpec, pack: NormalizedToolPackRef) => ToolDefinition[];

const TOOL_PACK_FACTORIES: Record<string, PackFactory> = {
  okf: (_spec, pack) => {
    if (!isOkfToolPack(pack)) {
      throw new Error('okf tool pack requires bundle');
    }
    return createOkfTools({ bundle: pack.bundle });
  },
};

export type ToolPackName = keyof typeof TOOL_PACK_FACTORIES;

export function resolveToolPacks(spec: LoadedAgentSpec): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const seen = new Set<string>();

  for (const pack of spec.tools.packs) {
    const factory = TOOL_PACK_FACTORIES[pack.name];
    if (!factory) {
      throw new Error(`Unknown tool pack "${pack.name}" on agent "${spec.id}"`);
    }
    for (const tool of factory(spec, pack)) {
      if (seen.has(tool.name)) {
        throw new Error(`Duplicate tool name "${tool.name}" on agent "${spec.id}"`);
      }
      seen.add(tool.name);
      tools.push(tool);
    }
  }

  return tools;
}

export function listKnownToolPacks(): string[] {
  return Object.keys(TOOL_PACK_FACTORIES);
}
