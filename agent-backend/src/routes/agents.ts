import { Hono } from 'hono';
import { bootAgentCatalog } from '../agent-catalog/boot.ts';
import { getAgentRegistry } from '../agent-catalog/registry.ts';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { listAllowedAgents } from '../auth/permissions.ts';
import { buildAgentA2aPublicInfo } from '../flue/a2a/public-info.ts';

const agents = new Hono();

agents.get(
  '/',
  requireAuth,
  requireResourcePermission('agent', 'playground', 'read'),
  async (c) => {
    const user = getUser(c);
    bootAgentCatalog();
    const names = await listAllowedAgents(user);
    const registry = getAgentRegistry();
    return c.json({
      agents: names.map((name) => {
        const meta = registry.get(name)?.spec;
        const a2a = meta ? buildAgentA2aPublicInfo(meta) : null;
        return {
          name,
          displayName: meta?.displayName ?? name,
          description: meta?.description,
          icon: meta?.icon,
          source: meta?.source === 'studio' ? 'studio' : 'platform',
          ...(a2a ? { a2a } : {}),
        };
      }),
    });
  },
);

export default agents;
