import { resolveAgentModel } from '../shared/resolve-agent-model.ts';
import { resolveAgentThinkingLevel } from '../shared/resolve-agent-thinking-level.ts';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { createSessionFileTools } from '../shared/session-file-tools.ts';
import { getAgentRequestContext } from '../flue/agent-request-context.ts';
import { augmentInstructionsWithAgentContext } from './agent-context.ts';
import { connectAgentMcpTools } from './load-mcp.ts';
import { resolveAgentCwd, resolveSandboxFactory } from './load-sandbox.ts';
import { loadAgentSkills } from './load-skills.ts';
import type { LoadedAgentSpec } from './schema.ts';

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
  const sessionFileTools = createSessionFileTools();
  const mcpTools = await connectAgentMcpTools(spec);
  const skills = loadAgentSkills(spec);
  const sandbox = resolveSandboxFactory(spec.sandbox, spec.id);
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
    tools: [...sessionFileTools, ...mcpTools],
    ...(sandbox ? { sandbox } : {}),
    ...(cwd ? { cwd } : {}),
    ...(thinkingLevel ? { thinkingLevel } : {}),
  };
}

export function resolveCatalogAgentRuntime(spec: LoadedAgentSpec): Promise<CatalogAgentRuntimeConfig> {
  const userId = spec.source === 'studio' ? (getAgentRequestContext()?.userId ?? 'anon') : 'shared';
  const cacheKey = `${spec.id}::${userId}`;
  const cached = runtimeByAgentId.get(cacheKey);
  if (cached) return cached;

  const pending = buildAgentRuntimeConfig(spec);
  runtimeByAgentId.set(cacheKey, pending);
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
