import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';
process.env.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME ?? 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const { initDocumentUpload } = await import('./document-upload.ts');

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

test('initDocumentUpload mints a presigned URL without probing storage', async () => {
  const fileHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const result = await initDocumentUpload({
    filename: 'paper.pdf',
    fileHash,
    sizeBytes: 2 * 1024 * 1024,
    contentType: 'application/pdf',
  });

  assert.equal(result.skip_upload, false);
  assert.ok(result.upload_url);
  assert.match(result.upload_url, /^https?:\/\//);
  assert.equal(result.method, 'PUT');
  assert.equal(result.headers['Content-Type'], 'application/pdf');
  assert.ok(result.s3_key.includes(fileHash));
  assert.doesNotMatch(result.upload_url, /x-amz-checksum/i);
  assert.doesNotMatch(result.upload_url, /x-amz-sdk-checksum/i);
});
