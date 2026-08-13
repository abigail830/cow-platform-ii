import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:5432/test';

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
