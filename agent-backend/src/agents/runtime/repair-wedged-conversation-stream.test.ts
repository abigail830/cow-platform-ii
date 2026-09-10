import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryConversationStreamStore } from '@flue/runtime/internal';
import { p as loadReducedConversationState } from '../../../node_modules/@flue/runtime/dist/flue-app-DweeRG3g.mjs';
import { w as reduceConversationRecords } from '../../../node_modules/@flue/runtime/dist/conversation-projections-XMug3C6A.mjs';
import {
  buildAbortRecoveryRecords,
  repairWedgedConversationStream,
} from './repair-wedged-conversation-stream.ts';

const CONVERSATION_ID = 'conv_test';
const PATH = 'agents/content-studio/user--session-1';

function envelope(type: string, id: string, extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    id,
    type,
    conversationId: CONVERSATION_ID,
    harness: 'default',
    session: 'default',
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function seedWedgedConversation(store: InMemoryConversationStreamStore) {
  const records = [
    envelope('conversation_created', 'record_root', {
      conversationId: CONVERSATION_ID,
      kind: 'root',
    }),
    envelope('user_message', 'record_user', {
      messageId: 'entry_user',
      parentId: null,
      content: [{ type: 'text', text: 'hello' }],
    }),
    envelope('assistant_message_started', 'record_asst_start', {
      messageId: 'entry_asst',
      parentId: 'entry_user',
      modelInfo: { provider: 'test', id: 'model' },
    }),
    envelope('assistant_text_started', 'record_text_start', {
      messageId: 'entry_asst',
      blockId: 'block_text_1',
      blockIndex: 0,
    }),
    envelope('assistant_text_delta', 'record_text_delta', {
      messageId: 'entry_asst',
      blockId: 'block_text_1',
      sequence: 0,
      delta: 'thinking...',
    }),
  ];

  let state = reduceConversationRecords(
    { conversations: new Map(), conversationScopes: new Map(), recordsById: new Map() },
    [],
    '-1',
  );
  for (const record of records) {
    state = reduceConversationRecords(state, [record], '0');
  }
  assert.equal(state.conversations.get(CONVERSATION_ID)?.inProgressMessages.size, 1);

  return store.createStream(PATH, { agentName: 'content-studio', instanceId: 'user--session-1' }).then(async () => {
    const claim = await store.acquireProducer(PATH, 'test-producer');
    await store.append({
      path: PATH,
      producerId: claim.producerId,
      producerEpoch: claim.producerEpoch,
      incarnation: claim.incarnation,
      producerSequence: claim.nextProducerSequence,
      records,
    });
  });
}

test('buildAbortRecoveryRecords completes open text blocks and aborts assistant', () => {
  const conversation = {
    conversationId: CONVERSATION_ID,
    harness: 'default',
    session: 'default',
    kind: 'root',
    inProgressMessages: new Map(),
  } as const;
  const inProgress = {
    messageId: 'entry_asst',
    parentId: 'entry_user',
    submissionId: 'sub-1',
    blocks: new Map([
      [
        'block_text_1',
        {
          type: 'text',
          blockId: 'block_text_1',
          blockIndex: 0,
          deltas: ['partial'],
          completed: false,
        },
      ],
    ]),
  };

  const records = buildAbortRecoveryRecords(conversation, inProgress);
  assert.equal(records.length, 2);
  assert.equal(records[0]?.type, 'assistant_text_completed');
  assert.equal(records[1]?.type, 'assistant_message_completed');
  assert.equal((records[1] as { stopReason?: string }).stopReason, 'aborted');
});

test('repairWedgedConversationStream clears in-progress assistant after abort wedge', async () => {
  const store = new InMemoryConversationStreamStore();
  await seedWedgedConversation(store);

  const before = (await loadReducedConversationState({ store, path: PATH })) as {
    conversations: Map<string, { inProgressMessages: Map<string, unknown> }>;
  };
  assert.equal(before.conversations.get(CONVERSATION_ID)?.inProgressMessages.size, 1);

  const result = await repairWedgedConversationStream('content-studio', 'user--session-1', {
    store,
  });
  assert.equal(result.repaired, true);
  assert.equal(result.inProgressCount, 1);

  const after = (await loadReducedConversationState({ store, path: PATH })) as {
    conversations: Map<string, { inProgressMessages: Map<string, unknown> }>;
  };
  assert.equal(after.conversations.get(CONVERSATION_ID)?.inProgressMessages.size, 0);
});
