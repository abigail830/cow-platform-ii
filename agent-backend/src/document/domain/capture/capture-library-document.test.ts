import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { storagePrefixFromS3Key } from '../../../infrastructure/oss/storage-read.ts';
import { captureMarkdownS3Key } from '../../infrastructure/audio-capture-files.ts';
import {
  captureLibraryDocumentFileHash,
  captureLibrarySourceKind,
  parseLibrarySourceKind,
  resolveCaptureLegacyDocumentId,
  resolveCaptureLibraryDocumentId,
  shouldShadowCaptureAsLibraryDocument,
} from './capture-library-document.ts';

describe('capture-library-document', () => {
  it('shadows audio and transcript captures only', () => {
    assert.equal(shouldShadowCaptureAsLibraryDocument('audio'), true);
    assert.equal(shouldShadowCaptureAsLibraryDocument('transcript'), true);
    assert.equal(shouldShadowCaptureAsLibraryDocument('document'), false);
    assert.equal(captureLibrarySourceKind('audio'), 'audio');
    assert.equal(captureLibrarySourceKind('document'), null);
    assert.equal(parseLibrarySourceKind({ source_kind: 'audio' }), 'audio');
    assert.equal(parseLibrarySourceKind({ source_kind: 'pdf' }), null);
  });

  it('resolves capture-level library document id', () => {
    assert.equal(resolveCaptureLibraryDocumentId({ library_document_id: ' doc-1 ' }), 'doc-1');
    assert.equal(resolveCaptureLibraryDocumentId({}), null);
    assert.equal(resolveCaptureLegacyDocumentId({ legacy_document_id: 'legacy-1' }), 'legacy-1');
  });

  it('uses a stable file hash per capture', () => {
    const first = captureLibraryDocumentFileHash('cap-1');
    assert.equal(captureLibraryDocumentFileHash('cap-1'), first);
    assert.notEqual(captureLibraryDocumentFileHash('cap-2'), first);
    assert.match(first, /^[a-f0-9]{64}$/);
  });

  it('points RAG import-context prefix at the capture markdown already on OSS', () => {
    const s3Key = captureMarkdownS3Key('cap-1');
    assert.equal(s3Key, 'captures/cap-1/markdown.md');
    assert.equal(storagePrefixFromS3Key(s3Key), 'captures/cap-1');
    assert.equal(`${storagePrefixFromS3Key(s3Key)}/markdown.md`, s3Key);
  });
});
