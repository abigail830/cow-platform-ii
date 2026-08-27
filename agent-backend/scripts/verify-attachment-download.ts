/**
 * Integration: resolve Flue conversation id + attachment put/get round-trip.
 * Usage: tsx scripts/verify-attachment-download.ts [agentName] [instanceId]
 */
import './load-env.ts';
import { createAttachmentRef } from '@flue/runtime/adapter';
import { signAttachmentAccessToken, verifyAttachmentAccessToken } from '../src/auth/attachment-access-token.ts';
import {
  agentConversationStreamPath,
  conversationIdFromInstanceId,
} from '../src/shared/model/agent-instance-id.ts';
import { resolveFlueConversationId } from '../src/flue/resolve-flue-conversation-id.ts';
import db from '../src/db.ts';

const agentName = process.argv[2]?.trim() || 'content-studio';
const instanceId =
  process.argv[3]?.trim() || 'smoke-user--smoke-conv';

const streamPath = agentConversationStreamPath(agentName, instanceId);
const appConversationId = conversationIdFromInstanceId(instanceId);
const bytes = new TextEncoder().encode('attachment-download-smoke');
const attachmentId = crypto.randomUUID();

async function main() {
  const persistence = db as {
    connect: () => Promise<{
      attachmentStore: {
        put: (input: unknown) => Promise<void>;
        get: (input: unknown) => Promise<{ bytes: Uint8Array } | null>;
      };
      conversationStreamStore: Parameters<typeof resolveFlueConversationId>[0];
    }>;
  };

  const { attachmentStore, conversationStreamStore } = await persistence.connect();
  const flueConversationId = await resolveFlueConversationId(conversationStreamStore, streamPath);

  if (!flueConversationId) {
    console.warn(
      `WARN no Flue conversation stream at ${streamPath} — using synthetic id for store-only check`,
    );
  } else {
    console.log(`Flue conversationId: ${flueConversationId}`);
    console.log(`App conversationId:  ${appConversationId}`);
    if (flueConversationId === appConversationId) {
      console.warn('WARN ids match — unexpected for Flue agents (usually different).');
    }
  }

  const conversationId = flueConversationId ?? 'synthetic-smoke-conv';
  const attachment = await createAttachmentRef({
    id: attachmentId,
    mimeType: 'text/plain',
    bytes,
    filename: 'smoke.txt',
  });

  await attachmentStore.put({
    streamPath,
    attachment,
    bytes,
    conversationId,
  });

  const stored = await attachmentStore.get({
    streamPath,
    conversationId,
    attachmentId,
  });
  if (!stored) {
    throw new Error(`attachmentStore.get missed path ${streamPath} conversationId=${conversationId}`);
  }

  const token = signAttachmentAccessToken({ agentName, instanceId, attachmentId });
  if (!verifyAttachmentAccessToken(token, { agentName, instanceId, attachmentId })) {
    throw new Error('signed attachment token verification failed');
  }

  console.log('OK attachment store round-trip on', streamPath);
  console.log('OK signed download token');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
