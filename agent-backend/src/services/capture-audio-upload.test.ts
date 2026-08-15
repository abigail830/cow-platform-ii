import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:5432/test';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';
process.env.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME ?? 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

test('initAudioSegmentUpload rejects invalid filename', async () => {
  const { initAudioSegmentUpload } = await import('./capture-audio-upload.ts');
  await assert.rejects(
    () =>
      initAudioSegmentUpload({
        filename: '',
        fileHash: 'abc',
        sizeBytes: 100,
      }),
    /filename/i,
  );
});

test('initAudioSegmentUpload rejects oversized payload', async () => {
  const { initAudioSegmentUpload } = await import('./capture-audio-upload.ts');
  await assert.rejects(
    () =>
      initAudioSegmentUpload({
        filename: 'audio.m4a',
        fileHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        sizeBytes: 1024 * 1024 * 1024,
      }),
    /maximum allowed size/i,
  );
});

test('initAudioSegmentUpload mints a presigned URL without probing storage', async () => {
  const { initAudioSegmentUpload } = await import('./capture-audio-upload.ts');
  const fileHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const result = await initAudioSegmentUpload({
    filename: 'clip.m4a',
    fileHash,
    sizeBytes: 1024,
    contentType: 'audio/mp4',
  });

  assert.equal(result.skip_upload, false);
  assert.ok(result.upload_url);
  assert.match(result.upload_url, /^https?:\/\//);
  assert.equal(result.method, 'PUT');
  assert.ok(result.s3_key.includes(fileHash));
});
