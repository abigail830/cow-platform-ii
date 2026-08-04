import '../load-env.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionImageExtractPrompt } from './session-file-vision-extract.ts';
import { resolveSessionFileVisionModel } from './session-file-vision-model.ts';

test('buildSessionImageExtractPrompt uses structured OCR-first template', () => {
  const prompt = buildSessionImageExtractPrompt('shot.png');
  assert.match(prompt, /# Image extract: shot\.png/);
  assert.match(prompt, /## Visible text/);
  assert.match(prompt, /## Visual summary/);
  assert.match(prompt, /## Uncertainties/);
  assert.match(prompt, /Do not guess or hallucinate/);
});

test('resolveSessionFileVisionModel falls back to default vlm when env unset', async () => {
  const previous = process.env.SESSION_FILE_VISION_MODEL;
  delete process.env.SESSION_FILE_VISION_MODEL;
  try {
    const model = await resolveSessionFileVisionModel();
    assert.equal(model.apiType, 'vlm');
    assert.equal(model.isDefault, true);
  } finally {
    if (previous === undefined) delete process.env.SESSION_FILE_VISION_MODEL;
    else process.env.SESSION_FILE_VISION_MODEL = previous;
  }
});
