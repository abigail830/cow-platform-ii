#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Longer paths first. Leaves src/db.ts (Flue adapter) unchanged. */
const REPLACEMENTS = [
  ['infrastructure/infrastructure/db/', 'infrastructure/db/'],
  ['src/db/schema.ts', 'src/infrastructure/db/schema.ts'],
  ['src/db/pool.ts', 'src/infrastructure/db/pool.ts'],
  ['src/db/index.ts', 'src/infrastructure/db/index.ts'],
  ['src/db/sync-rbac.ts', 'src/infrastructure/db/sync-rbac.ts'],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|md)$/.test(name)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(path.join(ROOT, 'src')).concat(walk(path.join(ROOT, 'scripts')))) {
  if (file.includes('fix-db-imports.mjs')) continue;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  for (const [from, to] of REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  if (text !== before) {
    fs.writeFileSync(file, text);
    changed++;
  }
}
console.log(`Updated ${changed} files`);
