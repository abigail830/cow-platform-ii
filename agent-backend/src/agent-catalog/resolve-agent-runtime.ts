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

/** FS agents with datasourceNames resolve MCP per user — do not use the shared warm cache. */
export function agentRuntimeNeedsUserScope(spec: LoadedAgentSpec): boolean {
  if (spec.source === 'studio') return true;
  return (spec.datasourceNames?.length ?? 0) > 0;
}

export function agentRuntimeCacheKey(spec: LoadedAgentSpec): string {
  if (agentRuntimeNeedsUserScope(spec)) {
    return `${spec.id}::${getAgentRequestContext()?.userId ?? 'anon'}`;
  }
  return `${spec.id}::shared`;
}

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
  const cacheKey = agentRuntimeCacheKey(spec);
  const cached = runtimeByAgentId.get(cacheKey);
  if (cached) return cached;

  const pending = buildAgentRuntimeConfig(spec).catch((error) => {
    // Do not poison the cache with a rejected warm/connect attempt.
    runtimeByAgentId.delete(cacheKey);
    throw error;
  });
  runtimeByAgentId.set(cacheKey, pending);
  return pending;
}

export async function warmCatalogAgentRuntimes(specs: LoadedAgentSpec[]): Promise<void> {
  const warmable = specs.filter((spec) => !agentRuntimeNeedsUserScope(spec));
  await Promise.all(warmable.map((spec) => resolveCatalogAgentRuntime(spec)));
}

export function resetCatalogAgentRuntimeCacheForTests(): void {
  runtimeByAgentId.clear();
}

/** Clear cached agent runtimes after model config or thinking-level changes. */
export function invalidateCatalogAgentRuntimeCache(): void {
  runtimeByAgentId.clear();
}
