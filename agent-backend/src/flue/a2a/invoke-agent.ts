import { createFlueClient } from '@flue/sdk';
import { signToken } from '../../auth/jwt.ts';
import { toAgentInstanceId } from '../../shared/agent-instance-id.ts';
import { extractPublishedProposals } from '../load-agent-conversation-snapshot.ts';
import { readPublicApiUrl } from './config.ts';
import { ensureA2aConversation } from './conversation.ts';
import { getA2aServiceUserId } from './service-user.ts';

export type InvokeFlueAgentResult = {
  text: string;
  artifacts: Array<{ filename: string; downloadUrl: string }>;
};

export async function invokeFlueAgentViaPrompt(input: {
  agentName: string;
  conversationId: string;
  message: string;
}): Promise<InvokeFlueAgentResult> {
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

  const promptResult = await client.agents.prompt(input.agentName, instanceId, {
    message: input.message,
  });

  const history = await client.agents.history(input.agentName, instanceId);
  const artifacts = extractPublishedProposals(history.messages);

  return {
    text: promptResult.result.text.trim(),
    artifacts,
  };
}
