import type { FlueConversationMessage } from '../load-agent-conversation-snapshot.ts';
import { extractPublishedProposals } from '../load-agent-conversation-snapshot.ts';
import { prepareA2aFlueSession } from './flue-client.ts';

export type InvokeFlueAgentResult = {
  text: string;
  artifacts: Array<{ filename: string; downloadUrl: string }>;
};

export type InvokeFlueAgentOptions = {
  agentName: string;
  conversationId: string;
  message: string;
  signal?: AbortSignal;
  /** Called as assistant text grows during Flue observe (for A2A streaming). */
  onAssistantText?: (text: string) => void;
};

const STREAM_TIMEOUT_MS = Number(process.env.A2A_STREAM_TIMEOUT_MS ?? 600_000);

function textFromMessages(messages: FlueConversationMessage[]): string {
  return messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim();
}

function isStillStreaming(messages: FlueConversationMessage[]): boolean {
  return messages.some((message) =>
    message.parts.some(
      (part) =>
        (part.type === 'text' || part.type === 'reasoning') &&
        part.state === 'streaming',
    ),
  );
}

export async function invokeFlueAgent(input: InvokeFlueAgentOptions): Promise<InvokeFlueAgentResult> {
  const { client, instanceId } = await prepareA2aFlueSession({
    agentName: input.agentName,
    conversationId: input.conversationId,
  });

  await client.agents.send(input.agentName, instanceId, {
    message: input.message,
    signal: input.signal,
  });

  const deadline = Date.now() + STREAM_TIMEOUT_MS;
  const observation = client.agents.observe(input.agentName, instanceId, { live: 'sse' });

  try {
    return await new Promise<InvokeFlueAgentResult>((resolve, reject) => {
      const abortOnSignal = () => {
        cleanup();
        reject(new Error('A2A invocation aborted'));
      };
      input.signal?.addEventListener('abort', abortOnSignal, { once: true });

      const cleanup = () => {
        input.signal?.removeEventListener('abort', abortOnSignal);
        unsub();
        observation.close();
      };

      const sync = () => {
        if (input.signal?.aborted) {
          abortOnSignal();
          return;
        }

        const snap = observation.getSnapshot();
        const messages = snap.conversation?.messages ?? [];
        const text = textFromMessages(messages);
        if (text) input.onAssistantText?.(text);

        if (snap.phase === 'error' && snap.error) {
          cleanup();
          reject(snap.error);
          return;
        }

        if (snap.phase === 'live' && text && !isStillStreaming(messages)) {
          cleanup();
          void client.agents
            .history(input.agentName, instanceId)
            .then((history) => {
              resolve({
                text,
                artifacts: extractPublishedProposals(history.messages),
              });
            })
            .catch(reject);
          return;
        }

        if (Date.now() > deadline) {
          cleanup();
          if (text) {
            void client.agents
              .history(input.agentName, instanceId)
              .then((history) => {
                resolve({
                  text,
                  artifacts: extractPublishedProposals(history.messages),
                });
              })
              .catch(reject);
          } else {
            reject(new Error('A2A observe timeout'));
          }
        }
      };

      observation.refresh();
      const unsub = observation.subscribe(sync);
      sync();
    });
  } catch (error) {
    observation.close();
    throw error;
  }
}

/** Blocking path retained for callers that do not need incremental observe callbacks. */
export async function invokeFlueAgentViaPrompt(
  input: Omit<InvokeFlueAgentOptions, 'onAssistantText' | 'signal'>,
): Promise<InvokeFlueAgentResult> {
  return invokeFlueAgent(input);
}
