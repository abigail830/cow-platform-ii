import type { AgentRouteHandler } from '@flue/runtime';
import { bearerToken, verifyToken } from '../auth/jwt.ts';
import { canAccessAgent, ownsConversation } from '../auth/permissions.ts';
import { conversationIdFromInstanceId } from '../shared/agent-instance-id.ts';

export function agentAccessRoute(agentName: string): AgentRouteHandler {
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    let user;
    try {
      user = verifyToken(token);
    } catch {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (!(await canAccessAgent(user, agentName))) return c.notFound();

    const instanceId = c.req.param('id');
    if (instanceId) {
      const conversationId = conversationIdFromInstanceId(instanceId);
      if (!(await ownsConversation(user.id, conversationId))) return c.notFound();
    }

    c.set('user', user);
    await next();
  };
}
