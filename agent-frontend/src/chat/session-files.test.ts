import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSessionFilesMessagePrefix,
  messageWithSessionFiles,
  parseSessionFilesManifest,
  stripSessionFilesManifest,
  type SessionFile,
} from './session-files.ts';

describe('session-files manifest', () => {
  const files: SessionFile[] = [
    {
      fileId: 'sf_abc123',
      filename: 'report.csv',
      sizeBytes: 42,
      mimeType: 'text/csv',
      includedInContext: true,
    },
  ];

  it('builds SESSION_FILES table prefix', () => {
    const prefix = buildSessionFilesMessagePrefix(files);
    assert.match(prefix, /^SESSION_FILES/);
    assert.match(prefix, /sf_abc123/);
    assert.match(prefix, /report\.csv/);
  });

  it('omits files with includedInContext=false', () => {
    assert.equal(
      buildSessionFilesMessagePrefix([{ ...files[0]!, includedInContext: false }]),
      '',
    );
  });

  it('wraps user text with manifest', () => {
    const message = messageWithSessionFiles('Summarize this', files);
    assert.match(message, /^SESSION_FILES/);
    assert.match(message, /Summarize this$/);
  });

  it('strips manifest for UI display', () => {
    const message = messageWithSessionFiles('Hello', files);
    assert.equal(stripSessionFilesManifest(message), 'Hello');
    const parsed = parseSessionFilesManifest(message);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.fileId, files[0]?.fileId);
    assert.equal(parsed[0]?.filename, files[0]?.filename);
  });

  it('omits processing files from manifest', () => {
    assert.equal(
      buildSessionFilesMessagePrefix([{ ...files[0]!, status: 'processing', localId: 'local-1' }]),
      '',
    );
  });
});
