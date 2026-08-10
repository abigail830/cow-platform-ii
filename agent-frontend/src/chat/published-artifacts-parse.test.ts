import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublishArtifactOutput } from './published-artifacts.ts';

test('parsePublishArtifactOutput reads downloadUrl from content-array tool output', () => {
  const artifact = parsePublishArtifactOutput([
    {
      type: 'text',
      text: JSON.stringify({
        attachmentId: 'att-1',
        downloadUrl: '/api/agents/a/b/attachments/att-1?token=t',
        filename: 'index-20241011-144011-001.html',
        mimeType: 'text/html',
        size: 42,
      }),
    },
  ]);

  assert.deepEqual(artifact, {
    downloadUrl: '/api/agents/a/b/attachments/att-1?token=t',
    filename: 'index-20241011-144011-001.html',
  });
});
