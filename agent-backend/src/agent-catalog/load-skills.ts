import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { defineSkill, type SkillReference } from '@flue/runtime';
import { resolveCatalogPath } from './paths.ts';
import type { LoadedAgentSpec } from './schema.ts';

const SKILL_FILE = 'SKILL.md';
const SENSITIVE_NAMES = new Set([
  '.env',
  '.env.local',
  'id_rsa',
  'credentials.json',
  'secrets.json',
]);

function collectOpenkmsSharedFiles(skillDir: string, files: Record<string, string>): void {
  const sharedDir = join(skillDir, '..', 'shared');
  if (!existsSync(sharedDir)) return;
  for (const name of readdirSync(sharedDir)) {
    if (name.startsWith('.')) continue;
    const full = join(sharedDir, name);
    if (!statSync(full).isFile()) continue;
    const rel = `shared/${name}`.replace(/\\/g, '/');
    if (!files[rel]) files[rel] = readFileSync(full, 'utf-8');
  }
}

function collectSkillFiles(skillDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(skillDir, full).replace(/\\/g, '/');
      if (rel === SKILL_FILE || SENSITIVE_NAMES.has(name)) continue;
      files[rel] = readFileSync(full, 'utf-8');
    }
  };
  walk(skillDir);
  collectOpenkmsSharedFiles(skillDir, files);
  return files;
}

function loadSkillFromDirectory(skillDir: string): SkillReference {
  const skillPath = join(skillDir, SKILL_FILE);
  if (!existsSync(skillPath)) {
    throw new Error(`SKILL.md not found in ${skillDir}`);
  }
  const raw = readFileSync(skillPath, 'utf-8');
  const parsed = matter(raw);
  const name = String(parsed.data.name ?? '').trim();
  const description = String(parsed.data.description ?? '').trim();
  if (!name || !description) {
    throw new Error(`SKILL.md in ${skillDir} requires name and description frontmatter`);
  }

  const dirName = skillDir.split('/').pop();
  if (name !== dirName) {
    throw new Error(`skill name "${name}" must match directory "${dirName}" in ${skillDir}`);
  }

  return defineSkill({
    name,
    description,
    instructions: parsed.content.trim(),
    license: typeof parsed.data.license === 'string' ? parsed.data.license : undefined,
    compatibility:
      typeof parsed.data.compatibility === 'string' ? parsed.data.compatibility : undefined,
    allowedTools:
      typeof parsed.data['allowed-tools'] === 'string' ? parsed.data['allowed-tools'] : undefined,
    metadata:
      parsed.data.metadata && typeof parsed.data.metadata === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.data.metadata as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : undefined,
    files: collectSkillFiles(skillDir),
  });
}

export function loadAgentSkills(spec: LoadedAgentSpec): SkillReference[] {
  const skills: SkillReference[] = [];
  const seen = new Set<string>();

  for (const skillRef of spec.skills) {
    const skillDir = resolveCatalogPath(skillRef, spec.agentDir);
    const skill = loadSkillFromDirectory(skillDir);
    if (seen.has(skill.name)) {
      throw new Error(`duplicate skill "${skill.name}" on agent "${spec.id}"`);
    }
    seen.add(skill.name);
    skills.push(skill);
  }

  return skills;
}
