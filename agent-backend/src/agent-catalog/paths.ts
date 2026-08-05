import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dev: `src/agent-catalog`; Vercel CJS bundle: function dir (`index.func`). */
const moduleDir = dirname(fileURLToPath(import.meta.url));

export function resolveBackendRootFromModuleDir(dir: string): string {
  if (existsSync(resolve(dir, 'agent-assets'))) {
    return dir;
  }
  const devRoot = resolve(dir, '../..');
  if (existsSync(resolve(devRoot, 'agent-assets'))) {
    return devRoot;
  }
  // Legacy fallback while bundles still ship agent-catalog/
  if (existsSync(resolve(dir, 'agent-catalog')) || existsSync(resolve(devRoot, 'agent-catalog'))) {
    return existsSync(resolve(dir, 'agent-catalog')) ? dir : devRoot;
  }
  return dir;
}

export const backendRoot = resolveBackendRootFromModuleDir(moduleDir);

export function agentAssetsRoot(): string {
  const fromEnv = process.env.AGENT_ASSETS_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);

  const nextToCwd = resolve(process.cwd(), 'agent-assets');
  if (existsSync(nextToCwd)) return nextToCwd;

  return resolve(backendRoot, 'agent-assets');
}

/** Platform agent definitions live under agent-assets/agents/. */
export function agentCatalogRoot(): string {
  const fromEnv = process.env.AGENT_CATALOG_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);

  const assetsAgents = join(agentAssetsRoot(), 'agents');
  if (existsSync(assetsAgents)) return assetsAgents;

  const legacy = resolve(backendRoot, 'agent-catalog');
  if (existsSync(legacy)) return legacy;

  return assetsAgents;
}

/**
 * Resolve a path from agent.yaml.
 * - `./x` or `x` → relative to the agent directory
 * - `/agent-assets/...` → relative to backend root (leading slash = repo-root style)
 */
export function resolveCatalogPath(relativePath: string, agentDir: string): string {
  const trimmed = relativePath.trim();
  if (trimmed.startsWith('/')) {
    return resolve(backendRoot, trimmed.slice(1));
  }
  return resolve(agentDir, trimmed);
}

export function assertCatalogExists(): void {
  if (!existsSync(agentCatalogRoot())) {
    throw new Error(`Platform agents not found at ${agentCatalogRoot()}`);
  }
}
