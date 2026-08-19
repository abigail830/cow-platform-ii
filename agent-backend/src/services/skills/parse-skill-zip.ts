import AdmZip from 'adm-zip';
import matter from 'gray-matter';

export const SKILL_FILE = 'SKILL.md';

const SENSITIVE_NAMES = new Set([
  '.env',
  '.env.local',
  'id_rsa',
  'credentials.json',
  'secrets.json',
]);

export type ParsedSkillZip = {
  name: string;
  title: string;
  description: string;
  instructions: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  files: Array<{ path: string; content: Buffer; contentType: string }>;
};

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'text/javascript';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'text/typescript';
  if (lower.endsWith('.py')) return 'text/x-python';
  if (lower.endsWith('.sh')) return 'text/x-shellscript';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'text/yaml';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function normalizeZipPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..' || part === '.')) return null;
  if (parts.some((part) => part.startsWith('.'))) return null;
  return normalized;
}

function findSkillMdPrefix(entries: string[]): string {
  const skillPaths = entries.filter((entry) => entry.endsWith(`/${SKILL_FILE}`) || entry === SKILL_FILE);
  if (skillPaths.length === 0) {
    throw new Error('ZIP must contain SKILL.md at the root or in a single top-level folder');
  }
  if (skillPaths.length > 1) {
    throw new Error('ZIP must contain exactly one SKILL.md');
  }
  const skillPath = skillPaths[0]!;
  if (skillPath === SKILL_FILE) return '';
  return skillPath.slice(0, -(SKILL_FILE.length + 1));
}

function parseTitle(name: string, frontmatter: Record<string, unknown>): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }
  return name
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function parseSkillZipBuffer(
  zipBuffer: Buffer,
  options?: { reservedNames?: Set<string>; maxExtractedBytes?: number },
): ParsedSkillZip {
  const maxExtractedBytes = options?.maxExtractedBytes ?? 100 * 1024 * 1024;
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => normalizeZipPath(entry.entryName))
    .filter((entry): entry is string => Boolean(entry));

  if (entries.length === 0) {
    throw new Error('ZIP archive is empty');
  }

  const prefix = findSkillMdPrefix(entries);
  const skillMdPath = prefix ? `${prefix}/${SKILL_FILE}` : SKILL_FILE;
  const skillEntry = zip.getEntry(skillMdPath);
  if (!skillEntry) {
    throw new Error('SKILL.md not found in ZIP');
  }

  const rawSkillMd = skillEntry.getData();
  const parsed = matter(rawSkillMd.toString('utf-8'));
  const name = String(parsed.data.name ?? '').trim();
  const description = String(parsed.data.description ?? '').trim();
  if (!name || !description) {
    throw new Error('SKILL.md requires name and description frontmatter');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('Skill name must be kebab-case starting with a letter');
  }
  if (options?.reservedNames?.has(name)) {
    throw new Error(`Skill name "${name}" is reserved`);
  }

  const files: ParsedSkillZip['files'] = [];
  let extractedBytes = rawSkillMd.length;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const rel = normalizeZipPath(entry.entryName);
    if (!rel) continue;
    if (prefix) {
      if (!rel.startsWith(`${prefix}/`)) continue;
    }
    const innerPath = prefix ? rel.slice(prefix.length + 1) : rel;
    if (!innerPath || innerPath === SKILL_FILE) continue;
    const baseName = innerPath.split('/').pop() ?? innerPath;
    if (SENSITIVE_NAMES.has(baseName)) continue;

    const content = entry.getData();
    extractedBytes += content.length;
    if (extractedBytes > maxExtractedBytes) {
      throw new Error('Extracted skill content exceeds maximum allowed size');
    }
    files.push({
      path: innerPath.replace(/\\/g, '/'),
      content,
      contentType: guessContentType(innerPath),
    });
  }

  const metadata: Record<string, string> = {};
  if (parsed.data.metadata && typeof parsed.data.metadata === 'object') {
    for (const [key, value] of Object.entries(parsed.data.metadata as Record<string, unknown>)) {
      if (typeof value === 'string') metadata[key] = value;
    }
  }

  return {
    name,
    title: parseTitle(name, parsed.data as Record<string, unknown>),
    description,
    instructions: parsed.content.trim(),
    license: typeof parsed.data.license === 'string' ? parsed.data.license : undefined,
    compatibility:
      typeof parsed.data.compatibility === 'string' ? parsed.data.compatibility : undefined,
    metadata,
    files,
  };
}
