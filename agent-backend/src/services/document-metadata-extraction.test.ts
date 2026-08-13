import assert from 'node:assert/strict';
import test from 'node:test';
import { metadataNeedsExtraction } from './document-metadata-extraction.ts';

test('returns true for empty metadata', () => {
  assert.equal(metadataNeedsExtraction({}), true);
  assert.equal(metadataNeedsExtraction(null), true);
});

test('returns true when all values are empty', () => {
  assert.equal(metadataNeedsExtraction({ title: null, tags: [] }), true);
});

test('returns false when any value is present', () => {
  assert.equal(metadataNeedsExtraction({ title: 'Doc' }), false);
});
