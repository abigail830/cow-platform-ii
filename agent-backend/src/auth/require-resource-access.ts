import type { Context } from 'hono';
import { getUser } from './jwt.ts';
import {
  resolveAudioChannelPermission,
  getAudioChannelIdForAudio,
} from './audio-resource-access.ts';
import {
  getDocumentChannelIdForDocument,
  resolveChannelPermission,
  resolveKnowledgeBasePermission,
  type ResourcePermissionLevel,
} from './resource-access.ts';

export async function denyUnlessAudioChannelAccess(
  c: Context,
  channelId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const user = getUser(c);
  const allowed = await resolveAudioChannelPermission(user.id, channelId).then((flags) => {
    if (required === 'manage') return flags.manage;
    if (required === 'write') return flags.write || flags.manage;
    return flags.read || flags.write || flags.manage;
  });
  if (!allowed) return c.json({ error: 'Forbidden' }, 403);
  return null;
}

export async function denyUnlessAudioAccess(
  c: Context,
  audioId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const channelId = await getAudioChannelIdForAudio(audioId);
  if (!channelId) return c.json({ error: 'Audio not found' }, 404);
  return denyUnlessAudioChannelAccess(c, channelId, required);
}

export async function denyUnlessChannelAccess(
  c: Context,
  channelId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const user = getUser(c);
  const allowed = await resolveChannelPermission(user.id, channelId).then((flags) => {
    if (required === 'manage') return flags.manage;
    if (required === 'write') return flags.write || flags.manage;
    return flags.read || flags.write || flags.manage;
  });
  if (!allowed) return c.json({ error: 'Forbidden' }, 403);
  return null;
}

export async function denyUnlessDocumentAccess(
  c: Context,
  documentId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const channelId = await getDocumentChannelIdForDocument(documentId);
  if (!channelId) return c.json({ error: 'Document not found' }, 404);
  return denyUnlessChannelAccess(c, channelId, required);
}

export async function denyUnlessKnowledgeBaseAccess(
  c: Context,
  knowledgeBaseId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const user = getUser(c);
  const flags = await resolveKnowledgeBasePermission(user.id, knowledgeBaseId);
  const allowed =
    required === 'manage'
      ? flags.manage
      : required === 'write'
        ? flags.write || flags.manage
        : flags.read || flags.write || flags.manage;
  if (!allowed) return c.json({ error: 'Forbidden' }, 403);
  return null;
}

export async function requireKnowledgeBaseId(
  c: Context,
  knowledgeBaseId: string | undefined,
  required: ResourcePermissionLevel,
): Promise<string | Response> {
  if (!knowledgeBaseId) return c.json({ error: 'Knowledge base id is required' }, 400);
  const denied = await denyUnlessKnowledgeBaseAccess(c, knowledgeBaseId, required);
  if (denied) return denied;
  return knowledgeBaseId;
}

/** Hono middleware: enforces KB ACL from HTTP method and sub-path under /:id. */
export function knowledgeBaseAccessMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const id = c.req.param('id');
    if (!id) return next();

    const path = c.req.path;
    const idIndex = path.indexOf(id);
    const suffix = idIndex >= 0 ? path.slice(idIndex + id.length) : '';

    if (suffix === '/access' || suffix.startsWith('/access/')) {
      return next();
    }

    const method = c.req.method;
    let level: ResourcePermissionLevel = 'read';
    if ((method === 'DELETE' || method === 'PATCH') && (suffix === '' || suffix === '/')) {
      level = 'manage';
    } else if (method !== 'GET' && method !== 'HEAD') {
      level = 'write';
    }

    const denied = await denyUnlessKnowledgeBaseAccess(c, id, level);
    if (denied) return denied;
    await next();
  };
}
