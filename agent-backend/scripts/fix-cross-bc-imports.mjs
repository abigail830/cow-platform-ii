#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'src');

/** Fix stale cross-BC sibling imports after services/* migration. */
const GLOBAL_REPLACEMENTS = [
  ["from '../pipeline/", "from '../../pipeline/application/"],
  ["from '../audio/", "from '../../audio/application/"],
  ["await import('../audio/domain/", "await import('../../audio/domain/"],
  ["from '../audio/domain/", "from '../../audio/domain/"],
  ["from '../audio/infrastructure/", "from '../../audio/infrastructure/"],
  ["await import('../audio/infrastructure/", "await import('../../audio/infrastructure/"],
  ["from '../capture/", "from '../../document/application/capture/"],
  ["from '../capture/domain/", "from '../../document/domain/capture/"],
  ["from '../documents/", "from '../../document/application/"],
  ["await import('../pipeline/", "await import('../../pipeline/application/"],
  ["await import('../audio/", "await import('../../audio/application/"],
  ["await import('../capture/", "await import('../../document/application/capture/"],
  ["await import('../capture/domain/", "await import('../../document/domain/capture/"],
  ["await import('../kb/infrastructure/", "await import('../../kb/infrastructure/"],
  ["from '../kb/infrastructure/", "from '../../kb/infrastructure/"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function apply(file, replacements) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  if (text !== before) fs.writeFileSync(file, text);
  return text !== before;
}

let n = 0;
for (const file of walk(ROOT)) {
  if (apply(file, GLOBAL_REPLACEMENTS)) n++;
}

/** Same-BC shortcuts: application/domain/infrastructure under one BC folder. */
const BC_DIRS = ['document', 'kb', 'pipeline', 'eval', 'audio', 'skills', 'model-config'];
for (const bc of BC_DIRS) {
  const base = path.join(ROOT, bc);
  if (!fs.existsSync(base)) continue;
  for (const layer of ['application', 'infrastructure']) {
    const dir = path.join(base, layer);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      if (apply(file, [[`../../${bc}/domain/`, '../domain/']])) n++;
    }
  }
  const domainDir = path.join(base, 'domain');
  if (fs.existsSync(domainDir)) {
    for (const file of walk(domainDir)) {
      if (apply(file, [["from '../pipeline/", "from '../../pipeline/domain/"]])) n++;
    }
  }
}

console.log(`Patched ${n} file operations`);
