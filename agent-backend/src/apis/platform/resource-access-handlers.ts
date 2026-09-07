import type { Context } from 'hono';
import { getUser } from '../../auth/jwt.ts';
import {
  getResourceAccessSettings,
  loadSkillRow,
  replaceResourceAccessSettings,
  resolveViewerResourcePermission,
  satisfiesResourcePermission,
  transferResourceOwner,
  type ResourceAccessPutInput,
  type ResourceType,
} from '../../auth/resource-access.ts';
import { scopeFromContext } from '../../auth/resource-access-request-cache.ts';

export async function handleGetResourceAccess(
  c: Context,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Response> {
  const user = getUser(c);
  const scope = scopeFromContext(c);

  if (resourceType === 'skill') {
    const skill = await loadSkillRow(resourceId, scope.cache);
    if (!skill) return c.json({ error: 'Skill not found' }, 404);
  }

  const myAccess = await resolveViewerResourcePermission(user.id, resourceType, resourceId, scope);
  if (!satisfiesResourcePermission(myAccess, 'read')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const settings = await getResourceAccessSettings(resourceType, resourceId, user.id, { ...scope, myAccess });
  if (!settings) return c.json({ error: 'Resource not found' }, 404);
  return c.json(settings);
}

export async function handlePutResourceAccess(
  c: Context,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Response> {
  const user = getUser(c);
  const scope = scopeFromContext(c);

  const body = await c.req.json<ResourceAccessPutInput>().catch(() => null);
  if (!body || !body.others || !Array.isArray(body.users)) {
    return c.json({ error: 'others and users are required' }, 400);
  }

  try {
    const settings = await replaceResourceAccessSettings(resourceType, resourceId, user.id, body, scope);
    return c.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update access';
    const status = message === 'Forbidden' ? 403 : 400;
    return c.json({ error: message }, status);
  }
}

export async function handleTransferResourceOwner(
  c: Context,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Response> {
  const user = getUser(c);
  const scope = scopeFromContext(c);

  const myAccess = await resolveViewerResourcePermission(user.id, resourceType, resourceId, scope);
  if (!satisfiesResourcePermission(myAccess, 'manage')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = (await c.req.json<{ user_id?: string }>().catch(() => null)) ?? null;
  if (!body?.user_id?.trim()) return c.json({ error: 'user_id is required' }, 400);

  try {
    const settings = await transferResourceOwner(resourceType, resourceId, user.id, body.user_id.trim(), scope);
    return c.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to transfer owner';
    const status =
      message === 'Forbidden' ? 403 : message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
}
