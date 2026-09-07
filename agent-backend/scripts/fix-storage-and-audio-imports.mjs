#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Longer paths first. */
const REPLACEMENTS = [
  // audio BC layering
  ['pipeline/domain/audio-pipeline-names', 'audio/domain/audio-pipeline-names'],
  ['pipeline/domain/audio-transcribe-workflow', 'audio/domain/audio-transcribe-workflow'],
  ['pipeline/domain/audio-pipeline-binding', 'audio/domain/audio-pipeline-binding'],
  ['audio/application/asr-hotword-validation', 'audio/domain/asr-hotword-validation'],
  ['audio/application/audio-pipeline-stale', 'audio/domain/audio-pipeline-stale'],
  ['audio/application/audio-pipeline-github-actions', 'audio/infrastructure/audio-pipeline-github-actions'],
  ['audio/application/audio-pipeline-runner', 'audio/infrastructure/audio-pipeline-runner'],
  [
    'audio/application/audio-capture-pipeline-github-actions',
    'document/infrastructure/audio-capture-pipeline-github-actions',
  ],
  // storage → infrastructure/oss + BC infrastructure
  ['storage/document-files', 'document/infrastructure/document-files'],
  ['storage/audio-capture-files', 'document/infrastructure/audio-capture-files'],
  ['storage/audio-files', 'audio/infrastructure/audio-files'],
  ['storage/eval-dataset-files', 'eval/infrastructure/eval-dataset-files'],
  ['storage/eval-run-files', 'eval/infrastructure/eval-run-files'],
  ['storage/skill-files', 'skills/infrastructure/skill-files'],
  ['infrastructure/oss/storage-read', 'infrastructure/oss/storage-read'],
  ['storage/object-storage-presign', 'infrastructure/oss/object-storage-presign'],
  ['storage/object-storage', 'infrastructure/oss/object-storage'],
  ['storage/prefix-utils', 'infrastructure/oss/prefix-utils'],
  ['storage/s3-config', 'infrastructure/oss/s3-config'],
  ['storage/s3-client', 'infrastructure/oss/s3-client'],
  // legacy capture BC (already merged)
  ['capture/application/', 'document/application/capture/'],
  ['../../capture/application/', '../../document/application/capture/'],
  ['../capture/application/', '../document/application/capture/'],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

let changed = 0;
const files = walk(path.join(ROOT, 'src')).concat(walk(path.join(ROOT, 'scripts')));
for (const file of files) {
  if (file.includes('fix-storage-and-audio-imports.mjs')) continue;
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
