import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertDocumentArtifactS3Key,
  buildDocumentArtifactKey,
  documentArtifactFile,
  parseDocumentArtifactKind,
  prefixFromDocumentS3Key,
} from './document-artifacts.ts';

describe('document artifacts', () => {
  it('parses known artifact kinds only', () => {
    assert.equal(parseDocumentArtifactKind('markdown'), 'markdown');
    assert.equal(parseDocumentArtifactKind('page_index'), 'page_index');
    assert.throws(() => parseDocumentArtifactKind('result'), /artifact must be/);
  });

  it('builds deterministic keys from the document prefix', () => {
    const s3Key = 'documents/abc123/original.pdf';
    assert.equal(prefixFromDocumentS3Key(s3Key), 'documents/abc123');
    assert.equal(buildDocumentArtifactKey(s3Key, 'markdown'), 'documents/abc123/markdown.md');
    assert.equal(buildDocumentArtifactKey(s3Key, 'page_index'), 'documents/abc123/page_index.json');
    assert.equal(documentArtifactFile('markdown').contentType, 'text/markdown');
    assert.equal(documentArtifactFile('page_index').contentType, 'application/json');
  });

  it('rejects a mismatched complete callback key', () => {
    assert.equal(
      assertDocumentArtifactS3Key('documents/abc123/original.pdf', 'markdown', 'documents/abc123/markdown.md'),
      'documents/abc123/markdown.md',
    );
    assert.throws(
      () =>
        assertDocumentArtifactS3Key(
          'documents/abc123/original.pdf',
          'page_index',
          'documents/abc123/markdown.md',
        ),
      /does not match/,
    );
  });
});
