import { resolveAgentModel } from '../shared/resolve-agent-model.ts';
import { resolveAgentThinkingLevel } from '../shared/resolve-agent-thinking-level.ts';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { augmentInstructionsWithAgentContext } from './agent-context.ts';
import { connectAgentMcpTools } from './load-mcp.ts';
import { createKbQaBrowserSandboxFactory } from '../sandboxes/kb-qa-browser-sandbox.ts';
import { resolveAgentCwd, resolveSandboxFactory } from './load-sandbox.ts';
import { loadAgentSkills } from './load-skills.ts';
import type { LoadedAgentSpec } from './schema.ts';
import { resolveToolPacks } from './tool-packs.ts';

export type CatalogAgentRuntimeConfig = {
  model: string;
  instructions: string;
  skills: ReturnType<typeof loadAgentSkills>;
  tools: Awaited<ReturnType<typeof connectAgentMcpTools>>;
  sandbox?: ReturnType<typeof resolveSandboxFactory>;
  cwd?: string;
  thinkingLevel?: ThinkingLevel;
};

const runtimeByAgentId = new Map<string, Promise<CatalogAgentRuntimeConfig>>();

async function buildAgentRuntimeConfig(spec: LoadedAgentSpec): Promise<CatalogAgentRuntimeConfig> {
  const packTools = resolveToolPacks(spec);
  const mcpTools = await connectAgentMcpTools(spec);
  const skills = loadAgentSkills(spec);
  const sandbox =
    spec.id === 'kb-qa'
      ? createKbQaBrowserSandboxFactory()
      : resolveSandboxFactory(spec.sandbox, spec.id);
  // E2B workspace cwd is applied inside the sandbox SessionEnv — avoid Flue's second cwd wrapper
  // (it produces a different env object and breaks session-scoped tool binding).
  const cwd = spec.sandbox.provider === 'e2b' ? undefined : resolveAgentCwd(spec.sandbox);

  const thinkingLevel = await resolveAgentThinkingLevel({
    configName: spec.model.configName,
    yamlThinkingLevel: spec.model.thinkingLevel,
  });

  return {
    model: await resolveAgentModel(spec.model),
    instructions: augmentInstructionsWithAgentContext(spec.instructions, spec.context),
    skills,
    tools: [...packTools, ...mcpTools],
    ...(sandbox ? { sandbox } : {}),
    ...(cwd ? { cwd } : {}),
    ...(thinkingLevel ? { thinkingLevel } : {}),
  };
}

export function resolveCatalogAgentRuntime(spec: LoadedAgentSpec): Promise<CatalogAgentRuntimeConfig> {
  const cached = runtimeByAgentId.get(spec.id);
  if (cached) return cached;

  const pending = buildAgentRuntimeConfig(spec);
  runtimeByAgentId.set(spec.id, pending);
  return pending;
}

export async function warmCatalogAgentRuntimes(specs: LoadedAgentSpec[]): Promise<void> {
  await Promise.all(specs.map((spec) => resolveCatalogAgentRuntime(spec)));
}

export function resetCatalogAgentRuntimeCacheForTests(): void {
  runtimeByAgentId.clear();
}

/** Clear cached agent runtimes after model config or thinking-level changes. */
export function invalidateCatalogAgentRuntimeCache(): void {
  runtimeByAgentId.clear();
}
