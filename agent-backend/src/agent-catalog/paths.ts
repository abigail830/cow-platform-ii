import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const backendRoot = resolve(moduleDir, '../..');

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
