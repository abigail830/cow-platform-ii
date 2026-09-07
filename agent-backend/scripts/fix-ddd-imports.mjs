#!/usr/bin/env node
/**
 * One-shot import path rewrites after shared/ → DDD layout migration.
 * Order matters: longer/more-specific patterns first.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const REPLACEMENTS = [
  ['pipeline/infrastructure/pipeline-config-store', 'pipeline/infrastructure/pipeline-config-store'],
  ['model-config/infrastructure/model-config-store', 'model-config/infrastructure/model-config-store'],
  ['model-config/infrastructure/model-cli-params', 'model-config/infrastructure/model-cli-params'],
  ['model-config/infrastructure/model-config-secret', 'model-config/infrastructure/model-config-secret'],
  ['model-config/infrastructure/model-registry', 'model-config/infrastructure/model-registry'],
  ['agents/domain/agent-instance-id', 'agents/domain/agent-instance-id'],
  ['eval/infrastructure/eval-judge-scenario-store', 'eval/infrastructure/eval-judge-scenario-store'],
  ['kb/application/faq-index-workflow', 'kb/application/faq-index-workflow'],
  ['kb/application/rag-index-workflow', 'kb/application/rag-index-workflow'],
  ['lib/', 'lib/'],
  ['document/domain/', 'document/domain/'],
  ['pipeline/domain/', 'pipeline/domain/'],
  ['model-config/', 'model-config/'],
  ['eval/domain/', 'eval/domain/'],
  ['kb/domain/', 'kb/domain/'],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(path.join(ROOT, 'src')).concat(walk(path.join(ROOT, 'scripts')))) {
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
