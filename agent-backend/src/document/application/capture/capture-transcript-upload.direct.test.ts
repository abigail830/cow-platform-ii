import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:5432/test';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';
process.env.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME ?? 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

test('initTranscriptSegmentUpload returns direct mode for markdown with inline body', async () => {
  const { initTranscriptSegmentUpload, normalizeTranscriptMarkdown } = await import(
    './capture-transcript-upload.ts'
  );
  const source = '# Notes\n\nHello transcript';
  const result = await initTranscriptSegmentUpload({
    captureId: 'cap-1',
    filename: 'notes.md',
    sizeBytes: Buffer.byteLength(source, 'utf8'),
    transcriptMarkdown: source,
  });

  assert.equal(result.mode, 'direct');
  assert.ok(result.file_hash);
  assert.ok(result.transcript_s3_key?.includes(result.file_hash));
  assert.equal(result.normalized_markdown, normalizeTranscriptMarkdown(source, 'notes.md'));
  assert.match(String(result.transcript_upload_url), /^https?:\/\//);
  assert.match(String(result.original_upload_url), /^https?:\/\//);
  assert.equal(result.transcript_headers?.['Content-Type'], 'text/markdown; charset=utf-8');
});

test('initTranscriptSegmentUpload returns direct mode for docx with inline body', async () => {
  const { initTranscriptSegmentUpload } = await import('./capture-transcript-upload.ts');
  const result = await initTranscriptSegmentUpload({
    captureId: 'cap-1',
    filename: 'notes.docx',
    sizeBytes: 4096,
    transcriptMarkdown: 'Speaker A: hello',
  });

  assert.equal(result.mode, 'direct');
  assert.equal(
    result.original_headers?.['Content-Type'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
});
