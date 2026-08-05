import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { resolveSkillAssetPath } from './manifest.ts';

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

export type SkillTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: SkillTreeNode[];
};

function isUnderRoot(rootReal: string, candidateReal: string): boolean {
  const prefix = rootReal.endsWith(sep) ? rootReal : `${rootReal}${sep}`;
  return candidateReal === rootReal || candidateReal.startsWith(prefix);
}

function resolveSafePath(skillRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error('Invalid path');
  }
  const rootReal = realpathSync(skillRoot);
  const full = join(skillRoot, normalized);
  if (!existsSync(full)) throw new Error('Not found');
  const fullReal = realpathSync(full);
  if (!isUnderRoot(rootReal, fullReal)) throw new Error('Invalid path');
  return fullReal;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function isPreviewableSkillFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(extOf(name));
}

export function listSkillTree(skillId: string): { skillId: string; tree: SkillTreeNode[] } {
  const root = resolveSkillAssetPath(skillId);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Skill directory missing for "${skillId}"`);
  }

  let count = 0;

  function walk(dir: string, rel: string): SkillTreeNode[] {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const nodes: SkillTreeNode[] = [];
    for (const entry of entries) {
      if (count >= MAX_TREE_ENTRIES) break;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        count += 1;
        nodes.push({
          name: entry.name,
          path: childRel,
          type: 'dir',
          children: walk(full, childRel),
        });
      } else if (entry.isFile()) {
        count += 1;
        nodes.push({ name: entry.name, path: childRel, type: 'file' });
      }
    }
    return nodes;
  }

  return { skillId, tree: walk(root, '') };
}

export function readSkillFile(
  skillId: string,
  relativePath: string,
): { path: string; content: string; truncated: boolean } {
  const root = resolveSkillAssetPath(skillId);
  const full = resolveSafePath(root, relativePath);
  const st = statSync(full);
  if (!st.isFile()) throw new Error('Not a file');
  const base = relativePath.split('/').pop() ?? relativePath;
  if (!isPreviewableSkillFile(base)) {
    throw new Error('File type is not previewable');
  }
  if (st.size > MAX_FILE_BYTES) {
    const buf = readFileSync(full);
    return {
      path: relativePath.replace(/\\/g, '/'),
      content: buf.subarray(0, MAX_FILE_BYTES).toString('utf-8'),
      truncated: true,
    };
  }
  return {
    path: relativePath.replace(/\\/g, '/'),
    content: readFileSync(full, 'utf-8'),
    truncated: false,
  };
}

export function defaultSkillPreviewPath(tree: SkillTreeNode[]): string | null {
  const skillMd = findFile(tree, 'SKILL.md');
  if (skillMd) return skillMd;
  return findFirstFile(tree);
}

function findFile(nodes: SkillTreeNode[], name: string): string | null {
  for (const node of nodes) {
    if (node.type === 'file' && node.name === name) return node.path;
    if (node.type === 'dir' && node.children) {
      const hit = findFile(node.children, name);
      if (hit) return hit;
    }
  }
  return null;
}

function findFirstFile(nodes: SkillTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'file' && isPreviewableSkillFile(node.name)) return node.path;
    if (node.type === 'dir' && node.children) {
      const hit = findFirstFile(node.children);
      if (hit) return hit;
    }
  }
  return null;
}
