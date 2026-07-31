import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import matter from 'gray-matter';

const RESERVED = new Set(['index.md', 'log.md']);
const VENDORED_BUNDLE_DIR = 'okf-bundle';
const MONOREPO_BUNDLE_DIR = '../smart-proposal-knowledge';

function bundleRoot(): string {
  const configured = process.env.OKF_BUNDLE_PATH?.trim();
  if (configured) return resolve(process.cwd(), configured);

  const vendored = resolve(process.cwd(), VENDORED_BUNDLE_DIR);
  if (existsSync(join(vendored, 'index.md'))) return vendored;

  const monorepo = resolve(process.cwd(), MONOREPO_BUNDLE_DIR);
  if (existsSync(join(monorepo, 'index.md'))) return monorepo;

  return vendored;
}

function splitFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const parsed = matter(text);
  return { meta: (parsed.data ?? {}) as Record<string, unknown>, body: parsed.content };
}

function resolveConcept(rel: string): string {
  const root = bundleRoot();
  const clean = rel.trim().replace(/^\//, '');
  const withExt = clean.endsWith('.md') ? clean : `${clean}.md`;
  const full = resolve(root, withExt);
  if (!full.startsWith(root)) throw new Error(`Path escapes bundle: ${rel}`);
  return full;
}

export function readConcept(rel: string, maxChars = 24_000) {
  const path = resolveConcept(rel);
  let text = readFileSync(path, 'utf-8');
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n\n…(truncated)`;
  const { meta, body } = splitFrontmatter(text);
  const id = relative(bundleRoot(), path).replace(/\.md$/, '');
  return {
    id,
    path: relative(bundleRoot(), path),
    type: meta.type,
    title: meta.title,
    frontmatter: meta,
    body: body.trim(),
  };
}

export function listConcepts(prefix = '', limit = 80) {
  const root = bundleRoot();
  const start = prefix ? join(root, prefix) : root;
  const out: Array<{ id: string; type?: unknown; title?: unknown; description?: string }> = [];

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (out.length >= limit) return;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!name.startsWith('.')) walk(full);
        continue;
      }
      if (!name.endsWith('.md') || RESERVED.has(name) || name === 'index.md') continue;
      const rel = relative(root, full);
      if (rel.split('/').some((p) => p.startsWith('.'))) continue;
      const text = readFileSync(full, 'utf-8');
      const { meta } = splitFrontmatter(text);
      out.push({
        id: rel.replace(/\.md$/, ''),
        type: meta.type,
        title: meta.title,
        description: String(meta.description ?? '').slice(0, 160),
      });
    }
  }

  walk(start);
  return out;
}

export function searchConcepts(query: string, limit = 12) {
  const root = bundleRoot();
  const q = query.toLowerCase();
  const hits: Array<{ score: number; item: { id: string; type?: unknown; title?: unknown } }> = [];

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!name.startsWith('.')) walk(full);
        continue;
      }
      if (!name.endsWith('.md') || RESERVED.has(name)) continue;
      const text = readFileSync(full, 'utf-8');
      const lower = text.toLowerCase();
      if (!lower.includes(q)) continue;
      const { meta } = splitFrontmatter(text);
      hits.push({
        score: lower.split(q).length - 1,
        item: {
          id: relative(root, full).replace(/\.md$/, ''),
          type: meta.type,
          title: meta.title,
        },
      });
    }
  }

  walk(root);
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.item);
}

export function templateSections(templateId: string) {
  const data = readConcept(`templates/${templateId}`);
  const sections = (data.frontmatter.sections as Array<Record<string, unknown>>) ?? [];
  return {
    template_id: data.frontmatter.template_id ?? templateId,
    title: data.title,
    anchor_example: data.frontmatter.anchor_example,
    default_layout: data.frontmatter.default_layout,
    sections: sections
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        required: s.required,
        default_enabled: s.default_enabled,
        block: s.block,
      })),
  };
}
