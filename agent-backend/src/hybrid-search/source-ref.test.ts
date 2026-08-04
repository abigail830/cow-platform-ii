import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSourceRef, supportsUdocViewer } from './source-ref.ts';

describe('supportsUdocViewer', () => {
  it('accepts common office and image types', () => {
    assert.equal(supportsUdocViewer('docx'), true);
    assert.equal(supportsUdocViewer('PDF'), true);
    assert.equal(supportsUdocViewer('md'), false);
  });
});

describe('buildSourceRef', () => {
  it('builds parsed and original urls from chunk metadata', () => {
    const ref = buildSourceRef({
      chunkId: 'chunk-1',
      knowledgeBaseId: 'kb-1',
      sourceType: 'chunk',
      documentId: 'doc-1',
      documentName: 'Policy.docx',
      fileType: 'DOCX',
      chunkIndex: 2,
      chunkMetadata: {
        heading: 'Section A',
        page_num: 3,
        node_id: 'n-42',
        line_num: 120,
      },
    });

    assert.ok(ref);
    assert.match(ref!.parsed_url, /\/knowledge\/documents\/doc-1\?/);
    assert.match(ref!.parsed_url, /view=parsed/);
    assert.match(ref!.parsed_url, /page=3/);
    assert.match(ref!.parsed_url, /node=n-42/);
    assert.match(ref!.parsed_url, /highlight=1/);
    assert.match(ref!.original_url, /view=original/);
    assert.doesNotMatch(ref!.original_url, /highlight=1/);
    assert.equal(ref!.preview_url, ref!.original_url);
    assert.equal(
      ref!.citation_markdown,
      '[Policy.docx](/knowledge/documents/doc-1?view=original&node=n-42&line=120&page=3&heading=Section+A)',
    );
  });

  it('uses parsed url as preview for non-udoc types', () => {
    const ref = buildSourceRef({
      chunkId: 'chunk-1',
      knowledgeBaseId: 'kb-1',
      sourceType: 'chunk',
      documentId: 'doc-1',
      documentName: 'Notes.md',
      fileType: 'md',
      chunkIndex: 0,
      chunkMetadata: { page_num: 1 },
    });

    assert.ok(ref);
    assert.equal(ref!.preview_url, ref!.parsed_url);
  });

  it('returns null without document id', () => {
    assert.equal(
      buildSourceRef({
        chunkId: 'c',
        knowledgeBaseId: 'kb',
        sourceType: 'faq',
        documentId: null,
        documentName: 'FAQ',
        fileType: null,
        chunkIndex: null,
        chunkMetadata: null,
      }),
      null,
    );
  });
});
