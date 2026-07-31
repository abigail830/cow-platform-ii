import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import matter from 'gray-matter';

const RESERVED = new Set(['index.md', 'log.md']);
const VENDORED_BUNDLE_DIR = 'okf-bundle';
const MONOREPO_BUNDLE_DIR = '../smart-proposal-knowledge';

function resolveBundleRoot(candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}

function assertBundleIndex(root: string): void {
  const indexPath = join(root, 'index.md');
  if (!existsSync(indexPath)) {
    throw new Error(
      `OKF bundle index.md not found at ${indexPath}. ` +
        'Set OKF_BUNDLE_PATH to the smart-proposal-knowledge directory (must contain index.md), not the git repo root.',
    );
  }
}

function bundleRoot(): string {
  const configured = process.env.OKF_BUNDLE_PATH?.trim();
  if (configured) {
    const root = resolveBundleRoot(configured);
    assertBundleIndex(root);
    return root;
  }

  for (const candidate of [
    resolve(process.cwd(), VENDORED_BUNDLE_DIR),
    resolve(process.cwd(), MONOREPO_BUNDLE_DIR),
  ]) {
    if (existsSync(join(candidate, 'index.md'))) return candidate;
  }

  throw new Error(
    'OKF_BUNDLE_PATH is not set and no default bundle was found. ' +
      'Example: OKF_BUNDLE_PATH=/path/to/okf-knowledge-bundle/smart-proposal-knowledge',
  );
}

function splitFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const parsed = matter(text);
  return { meta: (parsed.data ?? {}) as Record<string, unknown>, body: parsed.content };
}

/** Flue tools must return plain JSON (no Date, class instances, undefined, etc.). */
function toJsonValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) out[key] = toJsonValue(child);
    }
    return out;
  }
  return String(value);
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
    frontmatter: toJsonValue(meta) as Record<string, unknown>,
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
        type: toJsonValue(meta.type),
        title: toJsonValue(meta.title),
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
  return hits.slice(0, limit).map((h) => toJsonValue(h.item) as { id: string; type?: unknown; title?: unknown });
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
