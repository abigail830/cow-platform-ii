import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { InitialFiles } from 'just-bash';
import { backendRoot } from '../agent-catalog/paths.ts';

export const KB_QA_WORKSPACE_CWD = '/home/user/kb-qa';

const WORKSPACE_REL_PATHS = [
  'hybrid-search/scripts/list_knowledge_bases.mjs',
  'hybrid-search/scripts/hybrid_search.mjs',
  'shared/_client.mjs',
] as const;

export function resolveOpenkmsSkillRoot(): string {
  const candidates = [
    resolve(backendRoot, 'openkms-skill'),
    resolve(backendRoot, '..', 'openkms-skill'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'hybrid-search', 'SKILL.md'))) return candidate;
  }
  throw new Error(
    'openkms-skill not found (expected agent-backend/openkms-skill or repo root openkms-skill)',
  );
}

export function buildKbQaWorkspaceFiles(): InitialFiles {
  const skillRoot = resolveOpenkmsSkillRoot();
  const files: InitialFiles = {};

  for (const rel of WORKSPACE_REL_PATHS) {
    const sourcePath = join(skillRoot, rel);
    if (!existsSync(sourcePath)) {
      throw new Error(`Missing openkms-skill file for kb-qa workspace: ${sourcePath}`);
    }
    const vfsPath = `${KB_QA_WORKSPACE_CWD}/skills/${rel}`;
    files[vfsPath] = readFileSync(sourcePath, 'utf-8');
  }

  return files;
}

export function assertKbQaWorkspaceSourcesExist(): void {
  resolveOpenkmsSkillRoot();
  for (const rel of WORKSPACE_REL_PATHS) {
    const sourcePath = join(resolveOpenkmsSkillRoot(), rel);
    if (!existsSync(sourcePath)) {
      throw new Error(`kb-qa workspace source missing: ${sourcePath}`);
    }
  }
  const scriptsDir = join(resolveOpenkmsSkillRoot(), 'hybrid-search', 'scripts');
  const mjsCount = readdirSync(scriptsDir).filter((name) => name.endsWith('.mjs')).length;
  if (mjsCount < 2 || !statSync(scriptsDir).isDirectory()) {
    throw new Error(`Expected Node hybrid-search scripts in ${scriptsDir}`);
  }
}
