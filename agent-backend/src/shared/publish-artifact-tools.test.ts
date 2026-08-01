import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAttachmentStore, createAttachmentRef } from '@flue/runtime/adapter';
import { agentConversationStreamPath } from './agent-instance-id.ts';

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
