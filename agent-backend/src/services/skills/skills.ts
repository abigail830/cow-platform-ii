import { and, asc, eq, inArray } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { loadAssetManifest, resolveSkillAssetPath } from '../../agent-assets/manifest.ts';
import {
  appResourceGrants,
  appSkillFiles,
  appSkills,
  db,
  type SkillImportStatus,
  type SkillOrigin,
} from '../../db/index.ts';
import {
  isPlatformAdmin,
  userHasSkillAccess,
} from '../../auth/resource-access.ts';
import { parseSkillZipBuffer } from './parse-skill-zip.ts';
import { getReservedSkillNames, isUuidSkillId } from './reserved-names.ts';
import { dispatchSkillImport } from './skill-import.ts';
import { validateSkillUploadComplete } from './skill-upload.ts';
import { MAX_SKILL_EXTRACTED_BYTES } from '../../storage/skill-files.ts';
import type { SkillTreeNode } from '../../agent-assets/skill-browse.ts';
import {
  FULL_RESOURCE_ACCESS,
  NO_RESOURCE_ACCESS,
  normalizeResourcePermissionFlags,
  type ResourcePermissionFlags,
} from '../../auth/resource-access.ts';

export type SkillSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  origin: SkillOrigin;
  importStatus: SkillImportStatus;
  importError: string | null;
  canManage: boolean;
};

export type SkillDetail = SkillSummary & {
  license: string | null;
  compatibility: string | null;
  metadata: Record<string, string>;
  instructions: string;
  createdBy: string | null;
};

const MAX_TREE_ENTRIES = 400;
const MAX_FILE_BYTES = 256 * 1024;

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.css',
  '.sh',
  '.toml',
  '.ini',
  '.csv',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function isPreviewableSkillFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(extOf(name));
}

async function loadGrantsForSkills(skillIds: string[]) {
  if (skillIds.length === 0) return new Map<string, (typeof appResourceGrants.$inferSelect)[]>();
  const rows = await db
    .select()
    .from(appResourceGrants)
    .where(and(eq(appResourceGrants.resourceType, 'skill'), inArray(appResourceGrants.resourceId, skillIds)));
  const bySkill = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySkill.get(row.resourceId) ?? [];
    list.push(row);
    bySkill.set(row.resourceId, list);
  }
  return bySkill;
}

function permissionForSkill(
  userId: string,
  skill: { id: string; origin: string; createdBy: string | null },
  grants: typeof appResourceGrants.$inferSelect[],
  admin: boolean,
): ResourcePermissionFlags {
  if (admin) return FULL_RESOURCE_ACCESS;
  if (skill.origin === 'platform') {
    return admin ? FULL_RESOURCE_ACCESS : { read: true, write: false, manage: false };
  }
  if (skill.createdBy === userId) return FULL_RESOURCE_ACCESS;
  const userGrant = grants.find((grant) => grant.granteeType === 'user' && grant.granteeUserId === userId);
  if (userGrant) {
    return normalizeResourcePermissionFlags({
      read: userGrant.canRead,
      write: userGrant.canWrite,
      manage: userGrant.canManage,
    });
  }
  const othersGrant = grants.find((grant) => grant.granteeType === 'others');
  if (othersGrant) {
    return normalizeResourcePermissionFlags({
      read: othersGrant.canRead,
      write: othersGrant.canWrite,
      manage: othersGrant.canManage,
    });
  }
  return NO_RESOURCE_ACCESS;
}

export async function userHasSkillAccessByRef(
  userId: string,
  skillRef: string,
  level: 'read' | 'write' | 'manage',
): Promise<boolean> {
  const row = await getSkillRowByRef(skillRef);
  if (!row) return false;
  if (row.origin === 'platform') {
    if (level === 'read') return true;
    return isPlatformAdmin(userId);
  }
  return userHasSkillAccess(userId, row.id, level);
}

export async function assertSkillIdsAccessible(userId: string, skillIds: string[]): Promise<void> {
  for (const skillId of skillIds) {
    const allowed = await userHasSkillAccessByRef(userId, skillId, 'read');
    if (!allowed) {
      throw new Error(`No access to skill "${skillId}"`);
    }
    const row = await getSkillRowByRef(skillId);
    if (row?.origin === 'user' && row.importStatus !== 'ready') {
      throw new Error(`Skill "${skillId}" is not ready`);
    }
  }
}

async function getSkillRowByRef(ref: string) {
  if (isUuidSkillId(ref)) {
    const [row] = await db.select().from(appSkills).where(eq(appSkills.id, ref)).limit(1);
    return row ?? null;
  }
  const slug = ref.trim();
  const [platform] = await db
    .select()
    .from(appSkills)
    .where(and(eq(appSkills.slug, slug), eq(appSkills.origin, 'platform')))
    .limit(1);
  if (platform) return platform;
  return null;
}

export async function listVisibleSkillsForUser(userId: string): Promise<SkillSummary[]> {
  const admin = await isPlatformAdmin(userId);
  const allRows = await db.select().from(appSkills).orderBy(asc(appSkills.title));
  const userSkillIds = allRows.filter((row) => row.origin === 'user').map((row) => row.id);
  const grantsBySkill = await loadGrantsForSkills(userSkillIds);

  const visible: SkillSummary[] = [];
  for (const row of allRows) {
    if (row.origin === 'user' && row.importStatus === 'pending' && row.createdBy !== userId && !admin) {
      continue;
    }
    if (row.origin === 'user' && row.importStatus === 'failed' && row.createdBy !== userId && !admin) {
      continue;
    }
    const grants = grantsBySkill.get(row.id) ?? [];
    const flags = permissionForSkill(userId, row, grants, admin);
    if (!flags.read && row.origin !== 'platform') continue;
    if (row.origin === 'platform' || flags.read) {
      visible.push({
        id: row.origin === 'platform' ? row.slug : row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        origin: row.origin as SkillOrigin,
        importStatus: row.importStatus as SkillImportStatus,
        importError: row.importError,
        canManage:
          row.origin === 'platform' ? admin : flags.manage || row.createdBy === userId,
      });
    }
  }
  return visible;
}

export async function getSkillDetailForUser(
  userId: string,
  skillRef: string,
): Promise<SkillDetail | null> {
  const row = await getSkillRowByRef(skillRef);
  if (!row) return null;
  const canRead = await userHasSkillAccessByRef(userId, skillRef, 'read');
  if (!canRead) return null;

  const admin = await isPlatformAdmin(userId);
  const canManage =
    row.origin === 'platform' ? admin : await userHasSkillAccess(userId, row.id, 'manage');

  return {
    id: row.origin === 'platform' ? row.slug : row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    origin: row.origin as SkillOrigin,
    importStatus: row.importStatus as SkillImportStatus,
    importError: row.importError,
    canManage,
    license: row.license,
    compatibility: row.compatibility,
    metadata: row.metadata ?? {},
    instructions: row.instructions,
    createdBy: row.createdBy,
  };
}

export async function createPendingSkillFromUpload(input: {
  userId: string;
  filename: string;
  fileHash: string;
  s3Key: string;
  sizeBytes: number;
}) {
  const validated = validateSkillUploadComplete(input);
  const [row] = await db
    .insert(appSkills)
    .values({
      slug: `pending-${validated.fileHash.slice(0, 12)}`,
      title: validated.filename.replace(/\.zip$/i, ''),
      description: 'Importing skill…',
      instructions: '',
      origin: 'user',
      createdBy: input.userId,
      sourceS3Key: validated.s3Key,
      importStatus: 'pending',
      importError: null,
    })
    .returning();

  dispatchSkillImport(row!.id);
  return row!;
}

export async function importSkillZipBufferForUser(input: {
  userId: string;
  buffer: Buffer;
  titleOverride?: string;
}) {
  const parsed = parseSkillZipBuffer(input.buffer, {
    reservedNames: getReservedSkillNames(),
    maxExtractedBytes: MAX_SKILL_EXTRACTED_BYTES,
  });

  const [row] = await db
    .insert(appSkills)
    .values({
      slug: parsed.name,
      title: input.titleOverride?.trim() || parsed.title,
      description: parsed.description,
      instructions: parsed.instructions,
      license: parsed.license ?? null,
      compatibility: parsed.compatibility ?? null,
      metadata: parsed.metadata,
      origin: 'user',
      createdBy: input.userId,
      importStatus: 'ready',
    })
    .returning();

  if (parsed.files.length > 0) {
    await db.insert(appSkillFiles).values(
      parsed.files.map((file) => ({
        skillId: row!.id,
        filePath: file.path,
        content: file.content,
        contentType: file.contentType,
      })),
    );
  }

  return row!;
}

export async function deleteSkillForUser(userId: string, skillRef: string): Promise<void> {
  const row = await getSkillRowByRef(skillRef);
  if (!row) throw new Error('Skill not found');
  if (row.origin === 'platform') {
    if (!(await isPlatformAdmin(userId))) throw new Error('Forbidden');
  } else if (!(await userHasSkillAccess(userId, row.id, 'manage'))) {
    throw new Error('Forbidden');
  }
  await db.delete(appSkills).where(eq(appSkills.id, row.id));
}

function buildTreeFromPaths(paths: string[]): SkillTreeNode[] {
  const root: SkillTreeNode[] = [];
  let count = 0;

  function ensureDir(nodes: SkillTreeNode[], name: string, path: string): SkillTreeNode {
    let dir = nodes.find((node) => node.type === 'dir' && node.name === name);
    if (!dir) {
      dir = { name, path, type: 'dir', children: [] };
      nodes.push(dir);
    }
    if (!dir.children) dir.children = [];
    return dir;
  }

  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  for (const filePath of sorted) {
    if (count >= MAX_TREE_ENTRIES) break;
    const parts = filePath.split('/');
    let nodes = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      if (isFile) {
        nodes.push({ name: part, path: filePath, type: 'file' });
        count += 1;
      } else {
        const dir = ensureDir(nodes, part, currentPath);
        nodes = dir.children!;
      }
    }
  }

  const sortNodes = (nodes: SkillTreeNode[]): SkillTreeNode[] =>
    nodes
      .map((node) =>
        node.type === 'dir' && node.children
          ? { ...node, children: sortNodes(node.children) }
          : node,
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

  return sortNodes(root);
}

export async function listSkillTreeForUser(
  userId: string,
  skillRef: string,
): Promise<{ skillId: string; tree: SkillTreeNode[] }> {
  const detail = await getSkillDetailForUser(userId, skillRef);
  if (!detail) throw new Error('Skill not found');
  const row = await getSkillRowByRef(skillRef);
  if (!row) throw new Error('Skill not found');

  const files = await db
    .select({ filePath: appSkillFiles.filePath })
    .from(appSkillFiles)
    .where(eq(appSkillFiles.skillId, row.id));

  const paths = ['SKILL.md', ...files.map((file) => file.filePath)];
  return {
    skillId: detail.id,
    tree: buildTreeFromPaths(paths),
  };
}

export async function readSkillFileForUser(
  userId: string,
  skillRef: string,
  relativePath: string,
): Promise<{ path: string; content: string }> {
  const detail = await getSkillDetailForUser(userId, skillRef);
  if (!detail) throw new Error('Skill not found');
  const row = await getSkillRowByRef(skillRef);
  if (!row) throw new Error('Skill not found');

  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) throw new Error('Invalid path');

  if (normalized === 'SKILL.md') {
    if (Buffer.byteLength(detail.instructions, 'utf-8') > MAX_FILE_BYTES) {
      throw new Error('File too large to preview');
    }
    return { path: normalized, content: detail.instructions };
  }

  const [file] = await db
    .select()
    .from(appSkillFiles)
    .where(and(eq(appSkillFiles.skillId, row.id), eq(appSkillFiles.filePath, normalized)))
    .limit(1);
  if (!file) throw new Error('Not found');
  if (!isPreviewableSkillFile(normalized)) throw new Error('File is not previewable');
  if (file.content.length > MAX_FILE_BYTES) throw new Error('File too large to preview');

  const content = file.content.toString('utf-8');
  return { path: normalized, content };
}

export { loadSkillRecordForRuntime } from './skill-db-loader.ts';

export async function seedPlatformSkillsFromAssets(): Promise<number> {
  const manifest = loadAssetManifest();
  let inserted = 0;

  for (const entry of manifest.skills) {
    const skillDir = resolveSkillAssetPath(entry.id);
    if (!existsSync(skillDir)) continue;
    const skillPath = join(skillDir, 'SKILL.md');
    const raw = readFileSync(skillPath, 'utf-8');
    const parsed = matter(raw);
    const name = String(parsed.data.name ?? entry.id).trim();
    const description = String(parsed.data.description ?? entry.description).trim();
    const instructions = parsed.content.trim();

    const files: Array<{ path: string; content: Buffer; contentType: string }> = [];
    const walk = (dir: string) => {
      for (const fileName of readdirSync(dir)) {
        if (fileName.startsWith('.')) continue;
        const full = join(dir, fileName);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        const rel = relative(skillDir, full).replace(/\\/g, '/');
        if (rel === 'SKILL.md') continue;
        const buffer = readFileSync(full);
        files.push({
          path: rel,
          content: buffer,
          contentType: 'application/octet-stream',
        });
      }
    };
    walk(skillDir);

    const metadata: Record<string, string> = {};
    if (parsed.data.metadata && typeof parsed.data.metadata === 'object') {
      for (const [key, value] of Object.entries(parsed.data.metadata as Record<string, unknown>)) {
        if (typeof value === 'string') metadata[key] = value;
      }
    }

    const existing = await db
      .select({ id: appSkills.id })
      .from(appSkills)
      .where(and(eq(appSkills.slug, entry.id), eq(appSkills.origin, 'platform')))
      .limit(1);
    if (existing.length > 0) continue;

    const [row] = await db
      .insert(appSkills)
      .values({
        slug: entry.id,
        title: entry.title,
        description,
        instructions,
        license: typeof parsed.data.license === 'string' ? parsed.data.license : null,
        compatibility:
          typeof parsed.data.compatibility === 'string' ? parsed.data.compatibility : null,
        metadata,
        origin: 'platform',
        createdBy: null,
        importStatus: 'ready',
      })
      .returning();

    if (files.length > 0) {
      await db.insert(appSkillFiles).values(
        files.map((file) => ({
          skillId: row!.id,
          filePath: file.path,
          content: file.content,
          contentType: file.contentType,
        })),
      );
    }
    inserted += 1;
  }

  return inserted;
}
