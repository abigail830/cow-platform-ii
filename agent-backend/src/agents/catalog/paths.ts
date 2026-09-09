import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dev: `src/agents/catalog`; Vercel CJS bundle: function dir (`index.func`). */
const moduleDir = dirname(fileURLToPath(import.meta.url));

export function resolveBackendRootFromModuleDir(dir: string): string {
  let current = resolve(dir);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'agent-assets'))) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
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
    const withoutLeadingSlash = trimmed.slice(1);
    // Prefer agentAssetsRoot() — backendRoot may stop at src/agent-assets in dev (TS sources).
    if (withoutLeadingSlash === 'agent-assets' || withoutLeadingSlash.startsWith('agent-assets/')) {
      const suffix =
        withoutLeadingSlash === 'agent-assets'
          ? ''
          : withoutLeadingSlash.slice('agent-assets/'.length);
      return suffix ? resolve(agentAssetsRoot(), suffix) : agentAssetsRoot();
    }
    return resolve(backendRoot, withoutLeadingSlash);
  }
  return resolve(agentDir, trimmed);
}

export function assertCatalogExists(): void {
  if (!existsSync(agentCatalogRoot())) {
    throw new Error(`Platform agents not found at ${agentCatalogRoot()}`);
  }
}
