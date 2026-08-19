import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { parseSkillZipBuffer } from './parse-skill-zip.ts';

test('parseSkillZipBuffer accepts a valid skill zip', () => {
  const zip = new AdmZip();
  zip.addFile(
    'demo-skill/SKILL.md',
    Buffer.from(
      `---
name: demo-skill
description: Demo skill for tests
---

# Demo
`,
      'utf-8',
    ),
  );
  zip.addFile('demo-skill/references/guide.md', Buffer.from('# Guide', 'utf-8'));

  const parsed = parseSkillZipBuffer(zip.toBuffer());
  assert.equal(parsed.name, 'demo-skill');
  assert.equal(parsed.description, 'Demo skill for tests');
  assert.equal(parsed.instructions, '# Demo');
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0]?.path, 'references/guide.md');
});

test('parseSkillZipBuffer rejects missing SKILL.md', () => {
  const zip = new AdmZip();
  zip.addFile('readme.md', Buffer.from('nope', 'utf-8'));
  assert.throws(() => parseSkillZipBuffer(zip.toBuffer()), /SKILL.md/);
});
