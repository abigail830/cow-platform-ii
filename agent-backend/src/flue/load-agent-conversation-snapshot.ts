import type { ConversationStreamStore } from '@flue/runtime/adapter';
// Version-locked import — mirrors flue `GET /agents/:name/:id?view=history`.
import { f as handleAgentConversationRead } from '../../node_modules/@flue/runtime/dist/flue-app-DweeRG3g.mjs';

export type AgentConversationMessage = {
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
};

export type AgentConversationSnapshot = {
  conversationId: string;
  offset: string;
  messages: AgentConversationMessage[];
};

export async function loadAgentConversationSnapshot(
  store: ConversationStreamStore,
  streamPath: string,
): Promise<AgentConversationSnapshot | null> {
  const response = await handleAgentConversationRead({
    store,
    path: streamPath,
    request: new Request('http://flue.local/?view=history'),
  });

  if (!response.ok) return null;

  const body = (await response.json()) as AgentConversationSnapshot;
  if (!body?.messages) return null;
  return body;
}

export function countUserTurns(messages: AgentConversationMessage[]): number {
  return messages.filter((message) => message.role === 'user').length;
}

export type SessionProposal = {
  filename: string;
  downloadUrl: string;
};

export function extractPublishedProposals(messages: AgentConversationMessage[]): SessionProposal[] {
  const proposals: SessionProposal[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'dynamic-tool') continue;
      if (part.toolName !== 'publish_artifact') continue;

      const output = part.output;
      if (!output || typeof output !== 'object') continue;

      const record = output as Record<string, unknown>;
      const downloadUrl = typeof record.downloadUrl === 'string' ? record.downloadUrl : '';
      const filename =
        typeof record.filename === 'string' && record.filename.trim()
          ? record.filename.trim()
          : 'artifact';

      if (!downloadUrl || seen.has(downloadUrl)) continue;
      seen.add(downloadUrl);
      proposals.push({ filename, downloadUrl });
    }
  }

  return proposals;
}
