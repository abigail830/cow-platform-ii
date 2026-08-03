import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImageMediaType, normalizePromptMessage } from './prompt-images.ts';

test('normalizePromptMessage keeps text and uses placeholder for image-only sends', () => {
  assert.equal(normalizePromptMessage('hello', 0), 'hello');
  assert.equal(normalizePromptMessage('  ', 2), ' ');
  assert.equal(normalizePromptMessage('', 0), '');
});

test('isImageMediaType detects image mime types', () => {
  assert.equal(isImageMediaType('image/png'), true);
  assert.equal(isImageMediaType('text/plain'), false);
});
