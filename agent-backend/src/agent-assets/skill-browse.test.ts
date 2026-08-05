import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultSkillPreviewPath, listSkillTree, readSkillFile } from './skill-browse.ts';
import { resetAssetManifestCacheForTests } from './manifest.ts';

describe('skill-browse', () => {
  it('lists pptx tree and defaults to SKILL.md', () => {
    resetAssetManifestCacheForTests();
    const { tree } = listSkillTree('pptx');
    assert.ok(tree.some((n) => n.name === 'SKILL.md'));
    assert.equal(defaultSkillPreviewPath(tree), 'SKILL.md');
  });

  it('reads SKILL.md and rejects path traversal', () => {
    resetAssetManifestCacheForTests();
    const file = readSkillFile('docx', 'SKILL.md');
    assert.ok(file.content.includes('docx') || file.content.length > 0);
    assert.throws(() => readSkillFile('docx', '../manifest.yaml'));
    assert.throws(() => readSkillFile('docx', 'scripts/../../manifest.yaml'));
  });
});
