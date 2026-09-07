import type { Context } from 'hono';
import { getUser } from './jwt.ts';
import {
  getDocumentChannelIdForDocument,
  loadSkillRow,
  resolveChannelPermission,
  resolveKnowledgeBasePermission,
  resolveSkillPermission,
  satisfiesResourcePermission,
  type ResourcePermissionLevel,
} from './resource-access.ts';
import { scopeFromContext } from './resource-access-request-cache.ts';

export async function denyUnlessChannelAccess(
  c: Context,
  channelId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const user = getUser(c);
  const scope = scopeFromContext(c);
  const allowed = await resolveChannelPermission(user.id, channelId, scope).then((flags) =>
    satisfiesResourcePermission(flags, required),
  );
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
  const scope = scopeFromContext(c);
  const flags = await resolveKnowledgeBasePermission(user.id, knowledgeBaseId, scope);
  if (!satisfiesResourcePermission(flags, required)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

export async function denyUnlessSkillAccess(
  c: Context,
  skillId: string,
  required: ResourcePermissionLevel,
): Promise<Response | null> {
  const user = getUser(c);
  const scope = scopeFromContext(c);
  const skill = await loadSkillRow(skillId, scope.cache);
  if (!skill) return c.json({ error: 'Skill not found' }, 404);
  if (skill.origin === 'platform' && required === 'read') {
    return null;
  }
  const flags = await resolveSkillPermission(user.id, skillId, scope);
  if (!satisfiesResourcePermission(flags, required)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
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
