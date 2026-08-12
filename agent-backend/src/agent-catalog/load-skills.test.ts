import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAgentSkills } from './load-skills.ts';
import { loadAgentSpec } from './discover.ts';
import { agentCatalogRoot, resolveCatalogPath } from './paths.ts';

test('html-slides skill layout: references markdown + root assets', () => {
  const spec = loadAgentSpec(`${agentCatalogRoot()}/content-studio`);
  const skills = loadAgentSkills(spec);
  const htmlSlides = skills.find((skill) => skill.name === 'html-slides');
  assert.ok(htmlSlides, 'content-studio should load html-slides skill');

  const skillDir = resolveCatalogPath('/agent-assets/skills/html-slides', spec.agentDir);
  for (const rel of ['references/ascentium-deck.md', 'references/inspire-deck.md']) {
    assert.ok(existsSync(join(skillDir, rel)), `missing ${rel} in html-slides skill`);
  }
  for (const asset of [
    'assets/ascentium/asc_cover_right_top_corner.png',
    'assets/ascentium/asc_content_right-top-corner.png',
    'assets/ascentium/asc_logo_black.png',
    'assets/ascentium/asc_logo_white.png',
    'assets/inspire/inspire_logo_white.png',
    'assets/inspire/inspire_right_bottom_cover.png',
  ]) {
    assert.ok(existsSync(join(skillDir, asset)), `missing ${asset} in html-slides skill`);
  }
});

test('pptx skill layout: references markdown + root assets', () => {
  const spec = loadAgentSpec(`${agentCatalogRoot()}/content-studio`);
  const skills = loadAgentSkills(spec);
  const pptx = skills.find((skill) => skill.name === 'pptx');
  assert.ok(pptx, 'content-studio should load pptx skill');

  const skillDir = resolveCatalogPath('/agent-assets/skills/pptx', spec.agentDir);
  for (const rel of [
    'references/pptxgenjs.md',
    'references/ascentium-deck.md',
    'references/inspire-deck.md',
  ]) {
    assert.ok(existsSync(join(skillDir, rel)), `missing ${rel} in pptx skill`);
  }
  for (const asset of [
    'assets/ascentium/asc_cover_right_top_corner.png',
    'assets/ascentium/asc_content_right-top-corner.png',
    'assets/ascentium/asc_logo_black.png',
    'assets/ascentium/asc_logo_white.png',
    'assets/inspire/inspire_logo_white.png',
    'assets/inspire/inspire_right_bottom_cover.png',
  ]) {
    assert.ok(existsSync(join(skillDir, asset)), `missing ${asset} in pptx skill`);
  }
});
