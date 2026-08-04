import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isExternalHttpUrl, parseSourcePreviewHref } from './source-preview-href.ts';

describe('isExternalHttpUrl', () => {
  it('detects http and https links', () => {
    assert.equal(isExternalHttpUrl('https://example.com/doc'), true);
    assert.equal(isExternalHttpUrl('http://example.com'), true);
    assert.equal(isExternalHttpUrl('/knowledge/documents/abc'), false);
  });
});

describe('parseSourcePreviewHref', () => {
  it('parses original document preview urls', () => {
    assert.deepEqual(
      parseSourcePreviewHref('/knowledge/documents/doc-1?view=original&page=5'),
      { documentId: 'doc-1', page: 5 },
    );
  });

  it('ignores parsed document detail links', () => {
    assert.equal(parseSourcePreviewHref('/knowledge/documents/doc-1?view=parsed&page=5'), null);
  });

  it('ignores external urls', () => {
    assert.equal(parseSourcePreviewHref('https://example.com/knowledge/documents/doc-1'), null);
  });
});
