import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleUploadSession,
  audioStoragePrefix,
  buildAudioS3Key,
  createChunkUploadSession,
  extensionFromFilename,
  fileTypeFromExtension,
  sha256Hex,
  storeUploadChunk,
  transcriptS3Key,
  validateAudioFilename,
  validateFileHash,
  guessAudioContentType,
} from './audio-files.ts';

describe('audio-files', () => {
  it('validates accepted audio filenames and rejects unsupported extensions', () => {
    assert.equal(validateAudioFilename('meeting.m4a'), 'meeting.m4a');
    assert.throws(() => validateAudioFilename('notes.pdf'), /Unsupported file type/);
    assert.throws(() => validateAudioFilename('../secret.m4a'), /invalid/i);
  });

  it('derives extension and file type labels', () => {
    assert.equal(extensionFromFilename('clip.MP3'), 'mp3');
    assert.equal(fileTypeFromExtension('m4a'), 'M4A');
  });

  it('builds content-addressed S3 keys', () => {
    const hash = 'abc123';
    assert.equal(buildAudioS3Key(hash, 'm4a'), 'audio/abc123/original.m4a');
    assert.equal(audioStoragePrefix(hash), 'audio/abc123/');
    assert.equal(transcriptS3Key(hash), 'audio/abc123/transcript.md');
  });

  it('hashes file bytes deterministically', () => {
    const buffer = Buffer.from('hello-audio');
    const hash = sha256Hex(buffer);
    assert.equal(hash, sha256Hex(buffer));
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(validateFileHash(hash), hash);
    assert.throws(() => validateFileHash('not-a-hash'), /SHA-256/);
  });

  it('guesses audio content types from extensions', () => {
    assert.equal(guessAudioContentType('m4a'), 'audio/mp4');
    assert.equal(guessAudioContentType('mp3'), 'audio/mpeg');
  });

  it('assembles chunked upload sessions in order', () => {
    const uploadId = createChunkUploadSession({
      channelId: 'channel-1',
      filename: 'long.m4a',
      contentType: 'audio/mp4',
      totalChunks: 2,
    });

    storeUploadChunk(uploadId, 0, Buffer.from('part-a'));
    storeUploadChunk(uploadId, 1, Buffer.from('part-b'));

    const assembled = assembleUploadSession(uploadId);
    assert.equal(assembled.channelId, 'channel-1');
    assert.equal(assembled.filename, 'long.m4a');
    assert.equal(assembled.buffer.toString(), 'part-apart-b');
  });
});
