import { createFlueClient } from '@flue/sdk';
import { signToken } from '../../auth/jwt.ts';
import { toAgentInstanceId } from '../../shared/model/agent-instance-id.ts';
import { readPublicApiUrl } from './config.ts';
import { ensureA2aConversation } from './conversation.ts';
import { getA2aServiceUserId } from './service-user.ts';

export async function prepareA2aFlueSession(input: {
  agentName: string;
  conversationId: string;
}): Promise<{ client: ReturnType<typeof createFlueClient>; instanceId: string }> {
  const serviceUserId = await getA2aServiceUserId();
  await ensureA2aConversation({
    conversationId: input.conversationId,
    userId: serviceUserId,
    agentName: input.agentName,
    title: `A2A ${input.agentName}`,
  });

  const instanceId = toAgentInstanceId(serviceUserId, input.conversationId);
  const token = signToken({
    id: serviceUserId,
    email: 'a2a-service@internal',
    displayName: 'A2A Service',
    role: 'operator',
  });

  const client = createFlueClient({
    baseUrl: `${readPublicApiUrl()}/api`,
    token,
  });

  return { client, instanceId };
}
