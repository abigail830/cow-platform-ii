import type { AgentRouteHandler } from '@flue/runtime';
import { verifyAttachmentAccessToken } from './attachment-access-token.ts';
import { bearerToken, verifyToken } from './jwt.ts';
import { ownsConversation } from './permissions.ts';
import { conversationIdFromInstanceId } from '../shared/model/agent-instance-id.ts';

export function agentAttachmentsRoute(agentName: string): AgentRouteHandler {
  return async (c, next) => {
    const instanceId = c.req.param('id') ?? '';
    const attachmentId = c.req.param('attachmentId') ?? '';

    const bearer = bearerToken(c);
    if (bearer) {
      try {
        const user = verifyToken(bearer);
        const conversationId = conversationIdFromInstanceId(instanceId);
        if (!(await ownsConversation(user.id, conversationId))) return c.notFound();
        c.set('user', user);
        await next();
        return;
      } catch {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

    const accessToken = c.req.query('token')?.trim();
    if (
      accessToken &&
      verifyAttachmentAccessToken(accessToken, { agentName, instanceId, attachmentId })
    ) {
      await next();
      return;
    }

    return c.json({ error: 'Unauthorized' }, 401);
  };
}

export function agentAccessRoute(_agentName: string): AgentRouteHandler {
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    let user;
    try {
      user = verifyToken(token);
    } catch {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const instanceId = c.req.param('id');
    if (instanceId) {
      const conversationId = conversationIdFromInstanceId(instanceId);
      if (!(await ownsConversation(user.id, conversationId))) return c.notFound();
    }

    c.set('user', user);
    await next();
  };
}
