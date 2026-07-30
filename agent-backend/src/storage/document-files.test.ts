import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleUploadSession,
  archiveFilenameFromDocumentName,
  buildDocumentS3Key,
  createChunkUploadSession,
  documentStoragePrefix,
  extensionFromFilename,
  fileTypeFromExtension,
  sha256Hex,
  storeUploadChunk,
  validateDocumentFilename,
} from './document-files.ts';

describe('document-files', () => {
  it('validates accepted filenames and rejects unsupported extensions', () => {
    assert.equal(validateDocumentFilename('report.pdf'), 'report.pdf');
    assert.throws(() => validateDocumentFilename('virus.exe'), /Unsupported file type/);
    assert.throws(() => validateDocumentFilename('../secret.pdf'), /invalid/i);
  });

  it('derives extension and file type labels', () => {
    assert.equal(extensionFromFilename('archive.PDF'), 'pdf');
    assert.equal(fileTypeFromExtension('pdf'), 'PDF');
  });

  it('builds content-addressed S3 keys', () => {
    const hash = 'abc123';
    assert.equal(buildDocumentS3Key(hash, 'pdf'), 'documents/abc123/original.pdf');
    assert.equal(documentStoragePrefix(hash), 'documents/abc123/');
  });

  it('builds archive filenames from document names', () => {
    assert.equal(
      archiveFilenameFromDocumentName('InCorp Indonesia Proposal.docx'),
      'InCorp Indonesia Proposal.zip',
    );
    assert.match(archiveFilenameFromDocumentName('bad/name!.pdf'), /\.zip$/);
  });

  it('hashes file bytes deterministically', () => {
    const buffer = Buffer.from('hello-doc');
    const hash = sha256Hex(buffer);
    assert.equal(hash, sha256Hex(buffer));
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it('assembles chunked upload sessions in order', () => {
    const uploadId = createChunkUploadSession({
      channelId: 'channel-1',
      filename: 'large.pdf',
      contentType: 'application/pdf',
      totalChunks: 2,
    });

    storeUploadChunk(uploadId, 0, Buffer.from('part-a'));
    storeUploadChunk(uploadId, 1, Buffer.from('part-b'));

    const assembled = assembleUploadSession(uploadId);
    assert.equal(assembled.channelId, 'channel-1');
    assert.equal(assembled.filename, 'large.pdf');
    assert.equal(assembled.buffer.toString(), 'part-apart-b');
  });

  it('rejects missing chunks during assembly', () => {
    const uploadId = createChunkUploadSession({
      channelId: 'channel-1',
      filename: 'large.pdf',
      contentType: 'application/pdf',
      totalChunks: 2,
    });
    storeUploadChunk(uploadId, 0, Buffer.from('only-first'));
    assert.throws(() => assembleUploadSession(uploadId), /Not all chunks/);
  });
});
