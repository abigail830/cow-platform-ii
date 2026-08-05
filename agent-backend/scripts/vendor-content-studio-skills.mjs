#!/usr/bin/env node
/**
 * Vendor pptx + docx skills from anthropics/skills into content-studio agent catalog.
 * html-slides is maintained in-repo under skills/html-slides/.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(import.meta.url), '..');
const backendRoot = resolve(scriptDir, '..');
const skillsDest = join(backendRoot, 'agent-assets/skills');
const tmp = join(backendRoot, '.tmp-skills-vendor');

rmSync(tmp, { recursive: true, force: true });
mkdirSync(skillsDest, { recursive: true });

execSync(
  'git clone --depth 1 --filter=blob:none --sparse https://github.com/anthropics/skills.git .tmp-skills-vendor',
  { cwd: backendRoot, stdio: 'inherit' },
);
execSync('git sparse-checkout set skills/pptx skills/docx', {
  cwd: tmp,
  stdio: 'inherit',
});

for (const name of ['pptx', 'docx']) {
  const src = join(tmp, 'skills', name);
  const dest = join(skillsDest, name);
  if (!existsSync(join(src, 'SKILL.md'))) {
    throw new Error(`Missing SKILL.md in vendored ${name} skill`);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`Vendored ${name} → ${dest}`);
}

rmSync(tmp, { recursive: true, force: true });
console.log('Content-studio skills vendored.');
