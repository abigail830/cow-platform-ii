import { Hono } from 'hono';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../auth/rbac-catalog.ts';
import { listAccessibleKnowledgeBaseIds } from '../auth/resource-access.ts';
import { createHybridSearchService } from '../hybrid-search/service.ts';
import {
  hybridSearchPreferencesPatchSchema,
  hybridSearchRequestSchema,
} from '../hybrid-search/schemas.ts';

const hybridSearch = new Hono();
const service = createHybridSearchService();

hybridSearch.use('*', requireAuth);

hybridSearch.get(
  '/knowledge-bases',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.HYBRID_SEARCH,
    'read',
  ),
  async (c) => {
    const user = getUser(c);
    const visibleIds = await listAccessibleKnowledgeBaseIds(user.id);
    const items = await service.listSearchableKnowledgeBases([...visibleIds]);
    return c.json({ items });
  },
);

hybridSearch.get(
  '/preferences',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.HYBRID_SEARCH,
    'read',
  ),
  async (c) => {
    const user = getUser(c);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const preferences = await service.getPreferences(user.id);
    return c.json({ preferences });
  },
);

hybridSearch.patch(
  '/preferences',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.HYBRID_SEARCH,
    'read',
  ),
  async (c) => {
    const user = getUser(c);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => ({}));
    const parsed = hybridSearchPreferencesPatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid preferences' }, 400);
    }
    const preferences = await service.patchPreferences(user.id, parsed.data);
    return c.json({ preferences });
  },
);

hybridSearch.post(
  '/',
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.HYBRID_SEARCH,
    'read',
  ),
  async (c) => {
    const user = getUser(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = hybridSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
    }

    const visibleIds = await listAccessibleKnowledgeBaseIds(user.id);
    const forbidden = parsed.data.knowledge_base_ids.filter((id) => !visibleIds.has(id));
    if (forbidden.length > 0) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      const result = await service.search(parsed.data);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      const status = message.includes('not found')
        ? 404
        : message.includes('required')
          ? 400
          : 500;
      return c.json({ error: message }, status);
    }
  },
);

export default hybridSearch;
