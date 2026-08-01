import type { ConversationStreamStore } from '@flue/runtime/adapter';
// Version-locked import — mirrors flue-app selectRootConversation + loadReducedConversationState.
import { p as loadReducedConversationState } from '../../node_modules/@flue/runtime/dist/flue-app-DweeRG3g.mjs';

const DEFAULT_HARNESS = 'default';
const DEFAULT_SESSION = 'default';

type ReducedConversation = {
  kind: string;
  harness: string;
  session: string;
  conversationId: string;
};

type ReducedInstanceState = {
  conversations: Map<string, ReducedConversation>;
};

function selectRootConversation(state: ReducedInstanceState): ReducedConversation | undefined {
  const roots = [...state.conversations.values()].filter((conversation) => conversation.kind === 'root');
  return (
    roots.find(
      (conversation) =>
        conversation.harness === DEFAULT_HARNESS && conversation.session === DEFAULT_SESSION,
    ) ?? roots[0]
  );
}

/** Flue canonical conversation id for the agent instance stream (not app `conversations.id`). */
export async function resolveFlueConversationId(
  store: ConversationStreamStore,
  streamPath: string,
): Promise<string | undefined> {
  const state = (await loadReducedConversationState({
    store,
    path: streamPath,
  })) as ReducedInstanceState;
  return selectRootConversation(state)?.conversationId;
}
