#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Longer paths first. */
const REPLACEMENTS = [
  ['infrastructure/pipeline/pipeline-config-store', 'pipeline/infrastructure/pipeline-config-store'],
  ['domain/document/', 'document/domain/'],
  ['domain/kb/', 'kb/domain/'],
  ['domain/pipeline/', 'pipeline/domain/'],
  ['services/documents/', 'document/application/'],
  ['services/kb/', 'kb/application/'],
  ['services/pipeline/', 'pipeline/application/'],
  ['services/audio/', 'audio/application/'],
  ['services/capture/', 'document/application/capture/'],
  ['services/skills/', 'skills/application/'],
  ['storage/s3-client', 'infrastructure/oss/s3-client'],
  ['storage/s3-config', 'infrastructure/oss/s3-config'],
  ['storage/prefix-utils', 'infrastructure/oss/prefix-utils'],
  ['storage/object-storage', 'infrastructure/oss/object-storage'],
  ['storage/object-storage-presign', 'infrastructure/oss/object-storage-presign'],
  ['infrastructure/oss/storage-read', 'infrastructure/oss/storage-read'],
  ['storage/document-files', 'document/infrastructure/document-files'],
  ['storage/audio-capture-files', 'document/infrastructure/audio-capture-files'],
  ['storage/audio-files', 'audio/infrastructure/audio-files'],
  ['storage/eval-run-files', 'eval/infrastructure/eval-run-files'],
  ['storage/eval-dataset-files', 'eval/infrastructure/eval-dataset-files'],
  ['storage/skill-files', 'skills/infrastructure/skill-files'],
  ['skills/application/parse-skill-zip', 'skills/domain/parse-skill-zip'],
  ['skills/application/reserved-names', 'skills/domain/reserved-names'],
  ['src/db/schema.ts', 'src/infrastructure/db/schema.ts'],
  ['src/db/pool.ts', 'src/infrastructure/db/pool.ts'],
  ['src/db/index.ts', 'src/infrastructure/db/index.ts'],
  ['src/db/sync-rbac.ts', 'src/infrastructure/db/sync-rbac.ts'],
  ['pipeline/domain/audio-pipeline-names', 'audio/domain/audio-pipeline-names'],
  ['pipeline/domain/audio-transcribe-workflow', 'audio/domain/audio-transcribe-workflow'],
  ['pipeline/domain/audio-pipeline-binding', 'audio/domain/audio-pipeline-binding'],
  ['audio/application/asr-hotword-validation', 'audio/domain/asr-hotword-validation'],
  ['audio/application/audio-pipeline-stale', 'audio/domain/audio-pipeline-stale'],
  ['audio/application/audio-pipeline-github-actions', 'audio/infrastructure/audio-pipeline-github-actions'],
  ['audio/application/audio-pipeline-runner', 'audio/infrastructure/audio-pipeline-runner'],
  ['kb/application/kb-import-github-actions', 'kb/infrastructure/kb-import-github-actions'],
  ['kb/application/kb-import-runner', 'kb/infrastructure/kb-import-runner'],

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
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
  if (file.includes('fix-bc-imports.mjs')) continue;
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
