import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { agentAssetsRoot } from '../agent-catalog/paths.ts';

export type AssetType = 'agent' | 'skill' | 'mcp' | 'sandbox';

export type AssetManifestEntry = {
  id: string;
  path: string;
  title: string;
  description: string;
};

export type AssetManifest = {
  version: number;
  skills: AssetManifestEntry[];
  mcp: AssetManifestEntry[];
  sandbox: AssetManifestEntry[];
};

export type PlatformMcpTemplate = {
  id: string;
  title: string;
  description: string;
  /** Cursor/Claude-compatible connection blob only (`mcpServers`). */
  mcpServers: Record<string, Record<string, unknown>>;
};

export function loadAssetManifest(root = agentAssetsRoot()): AssetManifest {
  const path = join(root, 'manifest.yaml');
  if (!existsSync(path)) {
    throw new Error(`Asset manifest not found at ${path}`);
  }
  return parseYaml(readFileSync(path, 'utf-8')) as AssetManifest;
}

export function resetAssetManifestCacheForTests(): void {
  /* manifest is read fresh each call; hook retained for tests */
}

export function listPlatformAgentDirs(root = agentAssetsRoot()): string[] {
  const agentsRoot = join(root, 'agents');
  if (!existsSync(agentsRoot)) return [];
  return readdirSync(agentsRoot)
    .map((name) => join(agentsRoot, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory() && existsSync(join(dir, 'agent.yaml'));
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b));
}

export function loadPlatformMcpTemplate(id: string, root = agentAssetsRoot()): PlatformMcpTemplate {
  const manifest = loadAssetManifest(root);
  const entry = manifest.mcp.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown platform MCP "${id}"`);
  const fullPath = join(root, entry.path);
  const raw = JSON.parse(readFileSync(fullPath, 'utf-8')) as {
    mcpServers?: Record<string, Record<string, unknown>>;
  };
  if (!raw.mcpServers || typeof raw.mcpServers !== 'object') {
    throw new Error(`Invalid MCP template ${fullPath}: missing mcpServers`);
  }
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    mcpServers: raw.mcpServers,
  };
}

export function resolveSkillAssetPath(skillId: string, root = agentAssetsRoot()): string {
  const manifest = loadAssetManifest(root);
  const entry = manifest.skills.find((item) => item.id === skillId);
  if (!entry) throw new Error(`Unknown skill asset "${skillId}"`);
  return join(root, entry.path);
}

export function listAssetSummaries(type: Exclude<AssetType, 'agent'>, root = agentAssetsRoot()) {
  const manifest = loadAssetManifest(root);
  const entries = type === 'skill' ? manifest.skills : type === 'mcp' ? manifest.mcp : manifest.sandbox;
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    type,
  }));
}
