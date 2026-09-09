import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasExtractedMetadataContent,
  metadataNeedsExtraction,
  stripExtractedMetadataFields,
} from './document-metadata-extraction.ts';

test('returns true for empty metadata', () => {
  assert.equal(metadataNeedsExtraction({}), true);
  assert.equal(metadataNeedsExtraction(null), true);
});

test('returns true when all values are empty', () => {
  assert.equal(metadataNeedsExtraction({ title: null, tags: [] }), true);
});

test('returns false when any extraction field is present', () => {
  assert.equal(metadataNeedsExtraction({ title: 'Doc' }), false);
  assert.equal(metadataNeedsExtraction({ abstract: 'Summary' }), false);
});

test('ignores capture bookkeeping keys when deciding extraction', () => {
  assert.equal(
    metadataNeedsExtraction({
      knowledge_capture_id: 'cap-1',
      knowledge_capture_segment_id: 'seg-1',
      knowledge_archived: true,
    }),
    true,
  );
});

test('force option always requests extraction', () => {
  assert.equal(
    metadataNeedsExtraction({ abstract: 'Existing summary' }, { force: true }),
    true,
  );
});

test('hasExtractedMetadataContent detects populated fields', () => {
  assert.equal(hasExtractedMetadataContent({ abstract: 'Summary' }), true);
  assert.equal(hasExtractedMetadataContent({ abstract: null, author: '' }), false);
});

test('stripExtractedMetadataFields keeps bookkeeping keys', () => {
  assert.deepEqual(
    stripExtractedMetadataFields({
      abstract: 'Summary',
      author: 'Alice',
      knowledge_capture_id: 'cap-1',
      knowledge_archived: true,
    }),
    {
      knowledge_capture_id: 'cap-1',
      knowledge_archived: true,
    },
  );
});
