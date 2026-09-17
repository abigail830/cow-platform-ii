import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectIngestFileType,
  resolveIndexContentAudio,
  titleFromFilename,
} from './ingest-detect-type.ts';

describe('ingest-detect-type', () => {
  it('maps audio extensions and document fallback', () => {
    assert.equal(detectIngestFileType({ filename: 'a.m4a' }), 'audio');
    assert.equal(detectIngestFileType({ filename: 'report.pdf' }), 'document');
    assert.equal(detectIngestFileType({ filename: 'notes.md' }), 'document');
  });

  it('requires explicit type for transcript markdown', () => {
    assert.equal(
      detectIngestFileType({ filename: 'notes.md', explicitType: 'transcript' }),
      'transcript',
    );
    assert.throws(
      () => detectIngestFileType({ filename: 'notes.pdf', explicitType: 'transcript' }),
      /markdown/,
    );
  });

  it('titles from filename and narrows index_content', () => {
    assert.equal(titleFromFilename('Q3-review.m4a'), 'Q3-review');
    assert.equal(resolveIndexContentAudio(undefined), 'combined');
    assert.equal(resolveIndexContentAudio('summary'), 'summary');
    assert.throws(() => resolveIndexContentAudio('extraction'), /combined or summary/);
  });
});
