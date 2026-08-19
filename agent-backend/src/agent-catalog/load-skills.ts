import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { defineSkill, type SkillReference } from '@flue/runtime';
import { resolveCatalogPath } from './paths.ts';
import type { LoadedAgentSpec } from './schema.ts';
import { isUuidSkillId } from '../services/skills/reserved-names.ts';
import { resolveSkillAssetPath } from '../agent-assets/manifest.ts';

const SKILL_FILE = 'SKILL.md';
/** Sandbox-only binaries (E2B copy); skip UTF-8 packaging in defineSkill. */
const PACKAGED_SKILL_SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
]);
const SENSITIVE_NAMES = new Set([
  '.env',
  '.env.local',
  'id_rsa',
  'credentials.json',
  'secrets.json',
]);

function shouldPackageTextFile(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  return !PACKAGED_SKILL_SKIP_EXTENSIONS.has(ext);
}

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
      if (!shouldPackageTextFile(rel)) continue;
      files[rel] = readFileSync(full, 'utf-8');
    }
  };
  walk(skillDir);
  collectOpenkmsSharedFiles(skillDir, files);
  return files;
}

function buildSkillReference(input: {
  name: string;
  description: string;
  instructions: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  metadata?: Record<string, string>;
  files: Record<string, string>;
}): SkillReference {
  return defineSkill({
    name: input.name,
    description: input.description,
    instructions: input.instructions,
    license: input.license,
    compatibility: input.compatibility,
    allowedTools: input.allowedTools,
    metadata: input.metadata,
    files: input.files,
  });
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

  return buildSkillReference({
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

function loadSkillFromDbRecord(
  row: NonNullable<Awaited<ReturnType<typeof loadSkillRecordForRuntime>>>['row'],
  fileRows: NonNullable<Awaited<ReturnType<typeof loadSkillRecordForRuntime>>>['files'],
): SkillReference {
  const files: Record<string, string> = {};
  for (const file of fileRows) {
    if (!shouldPackageTextFile(file.filePath)) continue;
    files[file.filePath] = file.content.toString('utf-8');
  }
  return buildSkillReference({
    name: row.slug,
    description: row.description,
    instructions: row.instructions,
    license: row.license ?? undefined,
    compatibility: row.compatibility ?? undefined,
    metadata: row.metadata ?? undefined,
    files,
  });
}

function isFilesystemSkillRef(skillRef: string): boolean {
  return skillRef.startsWith('/') || skillRef.startsWith('./') || skillRef.startsWith('../');
}

async function loadSkillRef(skillRef: string, agentDir: string): Promise<SkillReference> {
  if (isFilesystemSkillRef(skillRef)) {
    const skillDir = resolveCatalogPath(skillRef, agentDir);
    return loadSkillFromDirectory(skillDir);
  }

  const { loadSkillRecordForRuntime } = await import('../services/skills/skill-db-loader.ts');
  const dbRecord = await loadSkillRecordForRuntime(skillRef);
  if (dbRecord) {
    return loadSkillFromDbRecord(dbRecord.row, dbRecord.files);
  }

  if (!isUuidSkillId(skillRef)) {
    try {
      const skillDir = resolveSkillAssetPath(skillRef);
      return loadSkillFromDirectory(skillDir);
    } catch {
      // fall through
    }
  }

  throw new Error(`Unknown skill "${skillRef}"`);
}

export async function loadAgentSkills(spec: LoadedAgentSpec): Promise<SkillReference[]> {
  const skills: SkillReference[] = [];
  const seen = new Set<string>();

  for (const skillRef of spec.skills) {
    const skill = await loadSkillRef(skillRef, spec.agentDir);
    if (seen.has(skill.name)) {
      throw new Error(`duplicate skill "${skill.name}" on agent "${spec.id}"`);
    }
    seen.add(skill.name);
    skills.push(skill);
  }

  return skills;
}
