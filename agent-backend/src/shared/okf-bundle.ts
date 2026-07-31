import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import matter from 'gray-matter';
import { backendRoot } from '../agent-catalog/paths.ts';
import type { OkfBundleRef } from './okf-bundle-ref.ts';

const RESERVED = new Set(['index.md', 'log.md']);

function resolveBundleRoot(candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(backendRoot, candidate);
}

function okfBundleEnvMissingError(envVar: string): Error {
  return new Error(
    `OKF bundle is not configured: environment variable ${envVar} is not set. ` +
      `Set ${envVar} to the directory containing index.md ` +
      '(local dev: absolute path to smart-proposal-knowledge; Vercel: okf-bundle).',
  );
}

function okfBundlePathInvalidError(
  envVar: string,
  configured: string,
  resolved: string,
): Error {
  return new Error(
    `OKF bundle path is invalid: ${envVar}=${JSON.stringify(configured)} ` +
      `resolves to ${resolved}, but index.md was not found. ` +
      `Check that ${envVar} points to the OKF knowledge bundle directory.`,
  );
}

function resolveBundleRefPath(bundle: OkfBundleRef): string {
  if (bundle.kind === 'env') {
    const configured = process.env[bundle.envVar]?.trim();
    if (!configured) {
      throw okfBundleEnvMissingError(bundle.envVar);
    }
    return resolveBundleRoot(configured);
  }
  return resolveBundleRoot(bundle.path);
}

/** Resolve OKF bundle directory from agent tool pack config. Throws if env/path is missing or invalid. */
export function resolveOkfBundleRoot(bundle: OkfBundleRef): string {
  const resolved = resolveBundleRefPath(bundle);
  const indexPath = join(resolved, 'index.md');
  if (!existsSync(indexPath)) {
    if (bundle.kind === 'env') {
      const configured = process.env[bundle.envVar]?.trim() ?? '';
      throw okfBundlePathInvalidError(bundle.envVar, configured, resolved);
    }
    throw new Error(
      `OKF bundle index.md not found at ${indexPath}. ` +
        'Check the okf tool pack bundle path in agent.yaml.',
    );
  }
  return resolved;
}

/** Non-throwing lookup for catalog validation. */
export function findOkfBundleRoot(bundle: OkfBundleRef): string | null {
  try {
    return resolveOkfBundleRoot(bundle);
  } catch {
    return null;
  }
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

export type OkfBundleAccessor = {
  root: string;
  readConcept: (rel: string, maxChars?: number) => ReturnType<typeof readConceptWithRoot>;
  listConcepts: (prefix?: string, limit?: number) => ReturnType<typeof listConceptsWithRoot>;
  searchConcepts: (query: string, limit?: number) => ReturnType<typeof searchConceptsWithRoot>;
  templateSections: (templateId: string) => ReturnType<typeof templateSectionsWithRoot>;
};

function resolveConceptPath(root: string, rel: string): string {
  const clean = rel.trim().replace(/^\//, '');
  const withExt = clean.endsWith('.md') ? clean : `${clean}.md`;
  const full = resolve(root, withExt);
  if (!full.startsWith(root)) throw new Error(`Path escapes bundle: ${rel}`);
  return full;
}

function readConceptWithRoot(root: string, rel: string, maxChars = 24_000) {
  const path = resolveConceptPath(root, rel);
  let text = readFileSync(path, 'utf-8');
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n\n…(truncated)`;
  const { meta, body } = splitFrontmatter(text);
  const id = relative(root, path).replace(/\.md$/, '');
  return {
    id,
    path: relative(root, path),
    type: meta.type,
    title: meta.title,
    frontmatter: toJsonValue(meta) as Record<string, unknown>,
    body: body.trim(),
  };
}

function listConceptsWithRoot(root: string, prefix = '', limit = 80) {
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

function searchConceptsWithRoot(root: string, query: string, limit = 12) {
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

function templateSectionsWithRoot(root: string, templateId: string) {
  const data = readConceptWithRoot(root, `templates/${templateId}`);
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

export function createBundleAccessor(bundlePath?: string): OkfBundleAccessor {
  const root = bundlePath
    ? resolveBundleRoot(bundlePath)
    : resolveOkfBundleRoot({ kind: 'env', envVar: 'OKF_BUNDLE_PATH' });
  return {
    root,
    readConcept: (rel, maxChars) => readConceptWithRoot(root, rel, maxChars),
    listConcepts: (prefix, limit) => listConceptsWithRoot(root, prefix, limit),
    searchConcepts: (query, limit) => searchConceptsWithRoot(root, query, limit),
    templateSections: (templateId) => templateSectionsWithRoot(root, templateId),
  };
}

const defaultAccessor = () => createBundleAccessor();

export function readConcept(rel: string, maxChars = 24_000) {
  return defaultAccessor().readConcept(rel, maxChars);
}

export function listConcepts(prefix = '', limit = 80) {
  return defaultAccessor().listConcepts(prefix, limit);
}

export function searchConcepts(query: string, limit = 12) {
  return defaultAccessor().searchConcepts(query, limit);
}

export function templateSections(templateId: string) {
  return defaultAccessor().templateSections(templateId);
}
