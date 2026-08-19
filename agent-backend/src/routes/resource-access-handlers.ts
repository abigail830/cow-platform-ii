import type { Context } from 'hono';
import { getUser } from '../auth/jwt.ts';
import {
  getResourceAccessSettings,
  replaceResourceAccessSettings,
  transferResourceOwner,
  type ResourceAccessPutInput,
  type ResourceType,
} from '../auth/resource-access.ts';
import { denyUnlessChannelAccess, denyUnlessKnowledgeBaseAccess, denyUnlessAudioChannelAccess, denyUnlessSkillAccess } from '../auth/require-resource-access.ts';

export async function handleGetResourceAccess(
  c: Context,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Response> {
  const user = getUser(c);
  const denied =
    resourceType === 'document_channel'
      ? await denyUnlessChannelAccess(c, resourceId, 'read')
      : resourceType === 'audio_channel'
        ? await denyUnlessAudioChannelAccess(c, resourceId, 'read')
        : resourceType === 'skill'
          ? await denyUnlessSkillAccess(c, resourceId, 'read')
        : await denyUnlessKnowledgeBaseAccess(c, resourceId, 'read');
  if (denied) return denied;

  const settings = await getResourceAccessSettings(resourceType, resourceId, user.id);
  if (!settings) return c.json({ error: 'Resource not found' }, 404);
  return c.json(settings);
}

export async function handlePutResourceAccess(
  c: Context,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Response> {
  const user = getUser(c);
  const denied =
    resourceType === 'document_channel'
      ? await denyUnlessChannelAccess(c, resourceId, 'manage')
      : resourceType === 'audio_channel'
        ? await denyUnlessAudioChannelAccess(c, resourceId, 'manage')
        : resourceType === 'skill'
          ? await denyUnlessSkillAccess(c, resourceId, 'manage')
        : await denyUnlessKnowledgeBaseAccess(c, resourceId, 'manage');
  if (denied) return denied;

  const body = await c.req.json<ResourceAccessPutInput>().catch(() => null);
  if (!body || !body.others || !Array.isArray(body.users)) {
    return c.json({ error: 'others and users are required' }, 400);
  }

  try {
    const settings = await replaceResourceAccessSettings(resourceType, resourceId, user.id, body);
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
  const denied =
    resourceType === 'document_channel'
      ? await denyUnlessChannelAccess(c, resourceId, 'manage')
      : resourceType === 'audio_channel'
        ? await denyUnlessAudioChannelAccess(c, resourceId, 'manage')
        : resourceType === 'skill'
          ? await denyUnlessSkillAccess(c, resourceId, 'manage')
        : await denyUnlessKnowledgeBaseAccess(c, resourceId, 'manage');
  if (denied) return denied;

  const body = await c.req.json<{ user_id?: string }>().catch(() => ({}));
  if (!body.user_id?.trim()) return c.json({ error: 'user_id is required' }, 400);

  try {
    const settings = await transferResourceOwner(resourceType, resourceId, user.id, body.user_id.trim());
    return c.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to transfer owner';
    const status =
      message === 'Forbidden' ? 403 : message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
}
