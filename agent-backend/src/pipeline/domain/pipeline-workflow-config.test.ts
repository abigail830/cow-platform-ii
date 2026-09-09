import assert from 'node:assert/strict';
import test from 'node:test';
import { metadataExtractEnabledInJobSnapshot } from './pipeline-workflow-config.ts';

test('metadataExtractEnabledInJobSnapshot detects enabled section', () => {
  const yaml = `
metadata_extract:
  enabled: true
  model_name: deepSeek-V4-Flash
`;
  assert.equal(metadataExtractEnabledInJobSnapshot(yaml), true);
});

test('metadataExtractEnabledInJobSnapshot rejects disabled section', () => {
  const yaml = `
metadata_extract:
  enabled: false
  model_name: deepSeek-V4-Flash
`;
  assert.equal(metadataExtractEnabledInJobSnapshot(yaml), false);
});

test('metadataExtractEnabledInJobSnapshot rejects missing model_name', () => {
  const yaml = `
metadata_extract:
  enabled: true
`;
  assert.equal(metadataExtractEnabledInJobSnapshot(yaml), false);
});
