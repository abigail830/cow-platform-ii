import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptedExtensionsForEvalMediaType,
  validateEvalDatasetFilename,
} from './eval-dataset-files.ts';

describe('eval-dataset-files document media', () => {
  it('accepts document extensions for document datasets', () => {
    const extensions = acceptedExtensionsForEvalMediaType('document');
    assert.ok(extensions.has('pdf'));
    assert.ok(extensions.has('docx'));
    assert.equal(extensions.has('wav'), false);
  });

  it('validates pdf filenames for document datasets', () => {
    assert.equal(
      validateEvalDatasetFilename('sample-report.pdf', 'document'),
      'sample-report.pdf',
    );
  });

  it('rejects audio filenames for document datasets', () => {
    assert.throws(
      () => validateEvalDatasetFilename('clip.wav', 'document'),
      /Unsupported file type/,
    );
  });

  it('still validates audio filenames for audio datasets', () => {
    assert.equal(validateEvalDatasetFilename('clip.wav', 'audio'), 'clip.wav');
  });
});
