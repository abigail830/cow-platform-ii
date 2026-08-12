import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentStudioTemplateRef,
  resolveE2bTemplateRef,
} from './e2b-templates.ts';

test('resolveE2bTemplateRef expands bare content-studio alias with tag', () => {
  delete process.env.E2B_CONTENT_STUDIO_TEMPLATE;
  delete process.env.E2B_CONTENT_STUDIO_TEMPLATE_TAG;

  assert.equal(resolveE2bTemplateRef('okf-content-studio'), 'okf-content-studio:1.11');
  assert.equal(resolveE2bTemplateRef('okf-content-studio:2.0'), 'okf-content-studio:2.0');
});

test('resolveE2bTemplateRef honors env overrides', () => {
  process.env.E2B_CONTENT_STUDIO_TEMPLATE = 'my-content-studio';
  process.env.E2B_CONTENT_STUDIO_TEMPLATE_TAG = 'beta';

  assert.equal(resolveE2bTemplateRef('my-content-studio'), 'my-content-studio:beta');
  assert.equal(contentStudioTemplateRef(), 'my-content-studio:beta');

  delete process.env.E2B_CONTENT_STUDIO_TEMPLATE;
  delete process.env.E2B_CONTENT_STUDIO_TEMPLATE_TAG;
});

test('resolveE2bTemplateRef leaves unknown bare ids unchanged', () => {
  assert.equal(resolveE2bTemplateRef('custom-template'), 'custom-template');
});
