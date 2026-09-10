import type { ConversationStreamStore } from '@flue/runtime/adapter';
import { agentConversationStreamPath } from '../domain/agent-instance-id.ts';
// Version-locked imports — mirror Flue conversation writer recovery records.
import { p as loadReducedConversationState } from '../../../node_modules/@flue/runtime/dist/flue-app-DweeRG3g.mjs';
import { w as reduceConversationRecords } from '../../../node_modules/@flue/runtime/dist/conversation-projections-XMug3C6A.mjs';

const DEFAULT_HARNESS = 'default';
const DEFAULT_SESSION = 'default';
const REPAIR_PRODUCER_PREFIX = 'platform-conversation-repair:';

type InProgressBlock = {
  type: string;
  blockId: string;
  blockIndex: number;
  deltas: string[];
  completed: boolean;
};

type InProgressMessage = {
  messageId: string;
  parentId: string | null;
  submissionId?: string;
  blocks: Map<string, InProgressBlock>;
};

type ReducedConversation = {
  conversationId: string;
  harness: string;
  session: string;
  kind: string;
  inProgressMessages: Map<string, InProgressMessage>;
};

type ReducedInstanceState = {
  conversations: Map<string, ReducedConversation>;
  recordsThroughOffset: string;
};

function zeroProviderUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function canonicalEnvelope(params: {
  type: string;
  recordId: string;
  conversationId: string;
  harness: string;
  session: string;
  submissionId?: string;
}) {
  return {
    v: 1,
    id: params.recordId,
    type: params.type,
    conversationId: params.conversationId,
    harness: params.harness,
    session: params.session,
    timestamp: new Date().toISOString(),
    ...(params.submissionId ? { submissionId: params.submissionId } : {}),
  };
}

/** Build the same completion records Flue uses in recoverInterruptedStream (non-continuable path). */
export function buildAbortRecoveryRecords(
  conversation: ReducedConversation,
  inProgress: InProgressMessage,
): Record<string, unknown>[] {
  // Omit submissionId — platform repair is not an authorized submission append.
  const scope = {
    conversationId: conversation.conversationId,
    harness: conversation.harness,
    session: conversation.session,
  };
  const records: Record<string, unknown>[] = [];

  for (const block of inProgress.blocks.values()) {
    if ((block.type === 'text' || block.type === 'reasoning') && !block.completed) {
      const type = block.type === 'text' ? 'assistant_text_completed' : 'assistant_reasoning_completed';
      records.push({
        ...canonicalEnvelope({
          type,
          recordId: `record_recovery_${inProgress.messageId}_${block.blockId}_completed`,
          ...scope,
        }),
        type,
        messageId: inProgress.messageId,
        blockId: block.blockId,
        deltaCount: block.deltas.length,
      });
    }
  }

  records.push({
    ...canonicalEnvelope({
      type: 'assistant_message_completed',
      recordId: `record_recovery_${inProgress.messageId}_aborted`,
      ...scope,
    }),
    type: 'assistant_message_completed',
    messageId: inProgress.messageId,
    stopReason: 'aborted',
    usage: zeroProviderUsage(),
    error: 'Stream interrupted before completion.',
  });

  return records;
}

function selectRootConversation(state: ReducedInstanceState): ReducedConversation | undefined {
  const roots = [...state.conversations.values()].filter((conversation) => conversation.kind === 'root');
  return (
    roots.find(
      (conversation) =>
        conversation.harness === DEFAULT_HARNESS && conversation.session === DEFAULT_SESSION,
    ) ?? roots[0]
  );
}

async function appendRepairRecords(
  store: ConversationStreamStore,
  path: string,
  agentName: string,
  instanceId: string,
  records: Record<string, unknown>[],
): Promise<void> {
  const identity = { agentName, instanceId };
  await store.createStream(path, identity);

  const producerId = `${REPAIR_PRODUCER_PREFIX}${crypto.randomUUID()}`;
  const claim = await store.acquireProducer(path, producerId);
  const state = (await loadReducedConversationState({
    store,
    path,
  })) as ReducedInstanceState;

  reduceConversationRecords(state, records, state.recordsThroughOffset);

  await store.append({
    path,
    producerId: claim.producerId,
    producerEpoch: claim.producerEpoch,
    incarnation: claim.incarnation,
    producerSequence: claim.nextProducerSequence,
    records,
  });
}

/**
 * Finalize any in-progress assistant message left behind when abort settlement
 * could not append (Flue linear append invariant). Without this, submission_settled
 * and the next user_message both fail, leaving the session queue wedged forever.
 */
export async function repairWedgedConversationStream(
  agentName: string,
  instanceId: string,
  options?: { store?: ConversationStreamStore },
): Promise<{ repaired: boolean; inProgressCount: number }> {
  let store = options?.store;
  if (!store) {
    const { getPlatformFlueStores } = await import('./platform-flue-stores.ts');
    store = (await getPlatformFlueStores()).conversationStreamStore;
  }
  const path = agentConversationStreamPath(agentName, instanceId);

  const state = (await loadReducedConversationState({
    store,
    path,
  })) as ReducedInstanceState;
  const conversation = selectRootConversation(state);
  if (!conversation) return { repaired: false, inProgressCount: 0 };

  const inProgressMessages = [...conversation.inProgressMessages.values()];
  if (inProgressMessages.length === 0) return { repaired: false, inProgressCount: 0 };

  const records = inProgressMessages.flatMap((inProgress) =>
    buildAbortRecoveryRecords(conversation, inProgress),
  );
  await appendRepairRecords(store, path, agentName, instanceId, records);

  const after = (await loadReducedConversationState({
    store,
    path,
  })) as ReducedInstanceState;
  const remaining = selectRootConversation(after)?.inProgressMessages.size ?? 0;
  if (remaining > 0) {
    console.warn('[flue:conversation-repair] in-progress assistant still present after repair', {
      agentName,
      instanceId,
      remaining,
    });
  } else {
    console.info('[flue:conversation-repair] finalized interrupted assistant stream', {
      agentName,
      instanceId,
      finalized: inProgressMessages.length,
    });
  }

  return { repaired: true, inProgressCount: inProgressMessages.length };
}

export async function repairWedgedConversationStreamWithRetry(
  agentName: string,
  instanceId: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await repairWedgedConversationStream(agentName, instanceId);
      if (result.repaired) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  if (lastError) throw lastError;
}
