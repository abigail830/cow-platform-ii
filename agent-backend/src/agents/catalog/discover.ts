import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { agentCatalogRoot, resolveCatalogPath } from './paths.ts';
import { agentYamlSchema, type LoadedAgentSpec } from './schema.ts';

function readPrompt(agentDir: string, promptPath: string): string {
  const fullPath = resolveCatalogPath(promptPath, agentDir);
  if (!existsSync(fullPath)) {
    throw new Error(`prompt file not found: ${fullPath}`);
  }
  const text = readFileSync(fullPath, 'utf-8').trim();
  if (!text) throw new Error(`prompt file is empty: ${fullPath}`);
  return text;
}

export function discoverAgentDirectories(catalogRoot = agentCatalogRoot()): string[] {
  if (!existsSync(catalogRoot)) return [];

  return readdirSync(catalogRoot)
    .map((name) => join(catalogRoot, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory() && existsSync(join(dir, 'agent.yaml'));
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b));
}

export function loadAgentSpec(agentDir: string): LoadedAgentSpec {
  const yamlPath = join(agentDir, 'agent.yaml');
  const raw = parseYaml(readFileSync(yamlPath, 'utf-8'));
  const parsed = agentYamlSchema.parse(raw);
  const instructions = readPrompt(agentDir, parsed.prompt);

  if (parsed.id !== agentDir.split('/').pop()) {
    throw new Error(
      `agent id "${parsed.id}" must match directory name "${agentDir.split('/').pop()}"`,
    );
  }

  return {
    ...parsed,
    agentDir,
    instructions,
    source: 'fs',
  };
}

export function loadAllAgentSpecs(catalogRoot = agentCatalogRoot()): LoadedAgentSpec[] {
  const dirs = discoverAgentDirectories(catalogRoot);
  const specs = dirs.map(loadAgentSpec);
  const ids = new Set<string>();
  for (const spec of specs) {
    if (ids.has(spec.id)) throw new Error(`duplicate agent id: ${spec.id}`);
    ids.add(spec.id);
  }
  return specs;
}
