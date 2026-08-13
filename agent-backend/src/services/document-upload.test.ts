import assert from 'node:assert/strict';
import test from 'node:test';
import { initDocumentUpload } from './document-upload.ts';

test('initDocumentUpload rejects invalid filename', async () => {
  await assert.rejects(
    () =>
      initDocumentUpload({
        filename: '',
        fileHash: 'abc',
        sizeBytes: 100,
      }),
    /filename/i,
  );
});

test('initDocumentUpload rejects oversized payload', async () => {
  await assert.rejects(
    () =>
      initDocumentUpload({
        filename: 'report.pdf',
        fileHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        sizeBytes: 1024 * 1024 * 1024,
      }),
    /maximum allowed size/i,
  );
});
