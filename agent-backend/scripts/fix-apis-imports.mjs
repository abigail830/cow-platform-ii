#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'src');

const GLOBAL = [
  ['agents/routes/', 'apis/agents/'],
  ['routes/skills.ts', 'apis/agents/studio/skills.ts'],
  ['routes/resource-access-handlers.ts', 'apis/platform/resource-access-handlers.ts'],
  ['routes/evaluation/runs.ts', 'apis/eval/runs.ts'],
  ['routes/', 'apis/'],
  // Keep tools/mcp/routes — not part of apis/ layer
  ['tools/mcp/apis/', 'tools/mcp/routes/'],
];

/** Files under src/apis/<domain>/*.ts (depth 2 from src). */
const DEPTH1_TO_2 = [
  'apis/auth/auth.ts',
  'apis/auth/user-api-keys.ts',
  'apis/knowledge/document-channels.ts',
  'apis/knowledge/documents.ts',
  'apis/knowledge/captures.ts',
  'apis/knowledge/knowledge-bases.ts',
  'apis/knowledge/hybrid-search.ts',
  'apis/knowledge/asr-hotwords.ts',
  'apis/agents/studio/skills.ts',
  'apis/platform/resource-access-handlers.ts',
  'apis/admin/storage.ts',
];

/** agents/routes → apis/agents: catalog/session/a2a paths. */
const AGENTS_API_FILES = walk(path.join(ROOT, 'apis/agents'));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function patchFile(file, mutator) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  text = mutator(text);
  if (text !== before) fs.writeFileSync(file, text);
  return text !== before;
}

function applyGlobal(text) {
  for (const [from, to] of GLOBAL) {
    text = text.split(from).join(to);
  }
  return text;
}

function deepenImports(text) {
  return text.replace(/from '\.\.\/((?!\.)(?!apis)[^']+)'/g, "from '../../$1'");
}

function patchAgentsImports(text) {
  return text
    .replace(/from '\.\.\/catalog\//g, "from '../../agents/catalog/")
    .replace(/from '\.\.\/a2a\//g, "from '../../agents/a2a/")
    .replace(/from '\.\.\/session\//g, "from '../../agents/session/")
    .replace(/from '\.\.\/\.\.\/agents\/domain\//g, "from '../../agents/domain/");
}

function patchResourceHandlers(text) {
  return text.replace(
    /from '\.\/resource-access-handlers\.ts'/g,
    "from '../platform/resource-access-handlers.ts'",
  );
}

let n = 0;
for (const file of walk(ROOT).concat(walk(path.join(ROOT, '..', 'scripts')))) {
  if (file.includes('fix-apis-imports.mjs')) continue;
  if (
    patchFile(file, (text) => {
      let next = applyGlobal(text);
      if (DEPTH1_TO_2.some((rel) => file.endsWith(rel))) {
        next = deepenImports(next);
      }
      if (
        file.includes(`${path.sep}apis${path.sep}knowledge${path.sep}knowledge-bases.ts`) ||
        file.includes(`${path.sep}apis${path.sep}knowledge${path.sep}document-channels.ts`) ||
        file.includes(`${path.sep}apis${path.sep}agents${path.sep}studio${path.sep}skills.ts`)
      ) {
        next = patchResourceHandlers(next);
      }
      if (AGENTS_API_FILES.includes(file)) {
        next = patchAgentsImports(next);
      }
      if (file.endsWith(`${path.sep}apis${path.sep}eval${path.sep}eval-runs-files-routes.test.ts`)) {
        next = next.replace(/'\.\/evaluation\/runs\.ts'/, "'./runs.ts'");
      }
      return next;
    })
  ) {
    n++;
  }
}

console.log(`Patched ${n} files`);
