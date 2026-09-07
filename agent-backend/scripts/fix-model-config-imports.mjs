#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const REPLACEMENTS = [
  ['services/models/model-chat-completions', 'model-config/application/chat-completions'],
  ['infrastructure/model-config/model-config-store', 'model-config/infrastructure/model-config-store'],
  ['infrastructure/model-config/model-cli-params', 'model-config/infrastructure/model-cli-params'],
  ['infrastructure/model-config/model-config-secret', 'model-config/infrastructure/model-config-secret'],
  ['infrastructure/model-config/model-registry', 'model-config/infrastructure/model-registry'],
  ['model-config/resolve-agent-thinking-level', 'model-config/application/resolve-agent-thinking-level'],
  ['model-config/resolve-agent-model', 'model-config/application/resolve-agent-model'],
  ['model-config/model-cli-client', 'model-config/infrastructure/model-cli-client'],
  ['model-config/model-flue-binding', 'model-config/infrastructure/model-flue-binding'],
  ['model-config/embedding-provider', 'model-config/domain/embedding-provider'],
  ['model-config/thinking-level', 'model-config/domain/thinking-level'],
  ['model-config/models', 'model-config/domain/models'],
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
  if (file.endsWith('fix-model-config-imports.mjs')) continue;
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
