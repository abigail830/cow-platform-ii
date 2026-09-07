import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCitationMarkdown, buildPageIndexSourceRef } from './source-ref.ts';

describe('buildCitationMarkdown', () => {
  it('escapes brackets in document names', () => {
    assert.equal(
      buildCitationMarkdown('A [draft]', '/knowledge/documents/d1?view=parsed'),
      '[A \\[draft\\]](/knowledge/documents/d1?view=parsed)',
    );
  });
});

describe('buildPageIndexSourceRef', () => {
  it('builds parsed preview urls with locator query params and no chunk_id', () => {
    const ref = buildPageIndexSourceRef({
      knowledgeBaseId: 'kb-1',
      documentId: 'doc-1',
      documentName: 'Policy.docx',
      fileType: 'DOCX',
      locator: {
        node_id: 'n-42',
        line_num: 120,
        page_num: 3,
        heading: 'Section A',
      },
    });

    assert.equal(ref.source_type, 'page_index');
    assert.equal(
      ref.preview_url,
      '/knowledge/documents/doc-1?view=parsed&node=n-42&line=120&page=3&heading=Section+A',
    );
    assert.equal(ref.preview_url, ref.parsed_url);
    assert.equal(ref.citation_markdown, `[Policy.docx](${ref.preview_url})`);
    assert.equal('chunk_id' in ref, false);
  });

  it('omits empty locator params', () => {
    const ref = buildPageIndexSourceRef({
      knowledgeBaseId: 'kb-1',
      documentId: 'doc-2',
      documentName: 'Notes.md',
      locator: null,
    });
    assert.equal(ref.preview_url, '/knowledge/documents/doc-2?view=parsed');
  });
});
