import { Hono } from 'hono';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { listAllowedAgents } from '../auth/permissions.ts';
import { AGENT_DISPLAY_NAMES } from '../shared/models.ts';

const agents = new Hono();

agents.get('/', requireAuth, async (c) => {
  const user = getUser(c);
  const names = await listAllowedAgents(user);
  return c.json({
    agents: names.map((name) => ({
      name,
      displayName: AGENT_DISPLAY_NAMES[name] ?? name,
    })),
  });
});

export default agents;
