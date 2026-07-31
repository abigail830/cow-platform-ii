import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dev: `src/agent-catalog`; Vercel CJS bundle: function dir (`index.func`). */
const moduleDir = dirname(fileURLToPath(import.meta.url));

export function resolveBackendRootFromModuleDir(dir: string): string {
  if (existsSync(resolve(dir, 'agent-catalog'))) {
    return dir;
  }
  const devRoot = resolve(dir, '../..');
  if (existsSync(resolve(devRoot, 'agent-catalog'))) {
    return devRoot;
  }
  return dir;
}

export const backendRoot = resolveBackendRootFromModuleDir(moduleDir);

export function agentCatalogRoot(): string {
  const fromEnv = process.env.AGENT_CATALOG_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);

  const nextToCwd = resolve(process.cwd(), 'agent-catalog');
  if (existsSync(nextToCwd)) return nextToCwd;

  return resolve(backendRoot, 'agent-catalog');
}

export function resolveCatalogPath(relativePath: string, agentDir: string): string {
  const base = relativePath.startsWith('/') ? backendRoot : agentDir;
  return resolve(base, relativePath);
}

export function assertCatalogExists(): void {
  if (!existsSync(agentCatalogRoot())) {
    throw new Error(`Agent catalog not found at ${agentCatalogRoot()}`);
  }
}
