import { Hono } from 'hono';
import { bootAgentCatalog } from '../agent-catalog/boot.ts';
import { getAgentRegistry } from '../agent-catalog/registry.ts';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { listAllowedAgents } from '../auth/permissions.ts';

const agents = new Hono();

agents.get('/', requireAuth, async (c) => {
  const user = getUser(c);
  bootAgentCatalog();
  const names = await listAllowedAgents(user);
  const registry = getAgentRegistry();
  return c.json({
    agents: names.map((name) => {
      const meta = registry.get(name)?.spec;
      return {
        name,
        displayName: meta?.displayName ?? name,
        description: meta?.description,
        icon: meta?.icon,
      };
    }),
  });
});

export default agents;
