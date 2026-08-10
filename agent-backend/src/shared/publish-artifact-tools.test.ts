import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAttachmentStore, createAttachmentRef } from '@flue/runtime/adapter';
import {
  buildAttachmentDownloadPath,
  absolutizePublicApiUrl,
} from './publish-artifact-tools.ts';
import { agentConversationStreamPath } from './agent-instance-id.ts';

test('buildAttachmentDownloadPath returns relative API URL with token', () => {
  const path = buildAttachmentDownloadPath('content-studio', 'user--conv-1', 'att-abc');
  assert.match(path, /^\/api\/agents\/content-studio\/user--conv-1\/attachments\/att-abc\?token=/);
  assert.doesNotMatch(path, /^https?:\/\//);
});

test('absolutizePublicApiUrl prefixes relative attachment paths', () => {
  const relative = '/api/agents/a/b/attachments/c?token=t';
  const absolute = absolutizePublicApiUrl(relative);
  assert.match(absolute, /^https?:\/\//);
  assert.ok(absolute.endsWith(relative));
});

test('attachment store rejects mismatched conversation id', async () => {
  const attachmentStore = new InMemoryAttachmentStore();
  const streamPath = agentConversationStreamPath('content-studio', 'user--app-conv');
  const bytes = new TextEncoder().encode('payload');
  const attachment = await createAttachmentRef({
    id: 'att-1',
    mimeType: 'text/plain',
    bytes,
    filename: 'a.txt',
  });

  await attachmentStore.put({
    streamPath,
    attachment,
    bytes,
    conversationId: 'app-conversation-uuid',
  });

  const wrong = await attachmentStore.get({
    streamPath,
    conversationId: 'flue-generated-conversation-id',
    attachmentId: 'att-1',
  });
  assert.equal(wrong, null);

  const right = await attachmentStore.get({
    streamPath,
    conversationId: 'app-conversation-uuid',
    attachmentId: 'att-1',
  });
  assert.ok(right);
});
