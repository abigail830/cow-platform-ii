import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import {
  appAudioChannels,
  appDocumentChannels,
  appKnowledgeBases,
  appResourceGrants,
  appSkills,
  appStudioAgents,
  appUsers,
  db,
  type ResourceType,
} from '../db/index.ts';
import { loadUserAccessProfile } from './rbac.ts';
import type { ChannelNode } from '../services/documents/documents.ts';
import {
  buildChannelAncestorChain,
  filterChannelTreeWithAccess,
  FULL_RESOURCE_ACCESS,
  mergeResourcePermissions,
  NO_RESOURCE_ACCESS,
  normalizeResourcePermissionFlags,
  satisfiesResourcePermission,
  type ChannelNodeWithAccess,
  type ResourceAccessGrantRow,
  type ResourceAccessSettings,
  type ResourceAccessUser,
  type ResourcePermissionFlags,
  type ResourcePermissionLevel,
} from './resource-access-utils.ts';

export type {
  ChannelNodeWithAccess,
  ResourceAccessGrantRow,
  ResourceAccessSettings,
  ResourceAccessUser,
  ResourcePermissionFlags,
  ResourcePermissionLevel,
};
export {
  buildChannelAncestorChain,
  filterChannelTreeWithAccess,
  FULL_RESOURCE_ACCESS,
  mergeResourcePermissions,
  NO_RESOURCE_ACCESS,
  normalizeResourcePermissionFlags,
  resourcePermissionLabel,
  satisfiesResourcePermission,
} from './resource-access-utils.ts';

export type ResourceAccessPutInput = {
  others: ResourcePermissionFlags;
  users: Array<{
    userId: string;
    read: boolean;
    write: boolean;
    manage: boolean;
  }>;
};

type ChannelRowLite = { id: string; parentId: string | null; createdBy: string | null };
type GrantRow = typeof appResourceGrants.$inferSelect;

function flagsFromGrantRow(row: Pick<GrantRow, 'canRead' | 'canWrite' | 'canManage'>): ResourcePermissionFlags {
  return normalizeResourcePermissionFlags({
    read: row.canRead,
    write: row.canWrite,
    manage: row.canManage,
  });
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const profile = await loadUserAccessProfile(userId);
  if (profile.roleKeys.includes('admin')) return true;
  const [user] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  return user?.role === 'admin' || user?.role === 'operator';
}

async function loadOwnerId(resourceType: ResourceType, resourceId: string): Promise<string | null> {
  if (resourceType === 'document_channel') {
    const [row] = await db
      .select({ createdBy: appDocumentChannels.createdBy })
      .from(appDocumentChannels)
      .where(eq(appDocumentChannels.id, resourceId))
      .limit(1);
    return row?.createdBy ?? null;
  }

  if (resourceType === 'audio_channel') {
    const [row] = await db
      .select({ createdBy: appAudioChannels.createdBy })
      .from(appAudioChannels)
      .where(eq(appAudioChannels.id, resourceId))
      .limit(1);
    return row?.createdBy ?? null;
  }

  if (resourceType === 'studio_agent') {
    const [row] = await db
      .select({ createdBy: appStudioAgents.createdBy })
      .from(appStudioAgents)
      .where(eq(appStudioAgents.id, resourceId))
      .limit(1);
    return row?.createdBy ?? null;
  }

  if (resourceType === 'skill') {
    const [row] = await db
      .select({ createdBy: appSkills.createdBy })
      .from(appSkills)
      .where(eq(appSkills.id, resourceId))
      .limit(1);
    return row?.createdBy ?? null;
  }

  const [row] = await db
    .select({ createdBy: appKnowledgeBases.createdBy })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, resourceId))
    .limit(1);
  return row?.createdBy ?? null;
}

async function loadGrantsForResources(
  resourceType: ResourceType,
  resourceIds: string[],
): Promise<Map<string, GrantRow[]>> {
  if (resourceIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appResourceGrants)
    .where(and(eq(appResourceGrants.resourceType, resourceType), inArray(appResourceGrants.resourceId, resourceIds)));

  const byResource = new Map<string, GrantRow[]>();
  for (const row of rows) {
    const list = byResource.get(row.resourceId) ?? [];
    list.push(row);
    byResource.set(row.resourceId, list);
  }
  return byResource;
}

function permissionAtLevel(
  userId: string,
  ownerId: string | null,
  grants: GrantRow[],
): ResourcePermissionFlags {
  if (ownerId && ownerId === userId) return FULL_RESOURCE_ACCESS;

  const userGrant = grants.find((grant) => grant.granteeType === 'user' && grant.granteeUserId === userId);
  if (userGrant) return flagsFromGrantRow(userGrant);

  const othersGrant = grants.find((grant) => grant.granteeType === 'others');
  if (othersGrant) return flagsFromGrantRow(othersGrant);

  return NO_RESOURCE_ACCESS;
}

async function loadAllChannelRows(): Promise<ChannelRowLite[]> {
  return db
    .select({
      id: appDocumentChannels.id,
      parentId: appDocumentChannels.parentId,
      createdBy: appDocumentChannels.createdBy,
    })
    .from(appDocumentChannels);
}

export async function resolveChannelPermission(
  userId: string,
  channelId: string,
  preloaded?: {
    channelRows?: ChannelRowLite[];
    grantsByResource?: Map<string, GrantRow[]>;
    admin?: boolean;
  },
): Promise<ResourcePermissionFlags> {
  if (preloaded?.admin ?? (await isPlatformAdmin(userId))) return FULL_RESOURCE_ACCESS;

  const channelRows = preloaded?.channelRows ?? (await loadAllChannelRows());
  const chain = buildChannelAncestorChain(
    channelId,
    channelRows.map((row) => ({ id: row.id, parent_id: row.parentId })),
  );
  if (chain.length === 0) return NO_RESOURCE_ACCESS;

  const ownerById = new Map(channelRows.map((row) => [row.id, row.createdBy]));
  const grantsByResource =
    preloaded?.grantsByResource ??
    (await loadGrantsForResources(
      'document_channel',
      chain,
    ));

  const perms = chain.map((id) =>
    permissionAtLevel(userId, ownerById.get(id) ?? null, grantsByResource.get(id) ?? []),
  );
  return mergeResourcePermissions(...perms);
}

export async function resolveKnowledgeBasePermission(
  userId: string,
  knowledgeBaseId: string,
): Promise<ResourcePermissionFlags> {
  if (await isPlatformAdmin(userId)) return FULL_RESOURCE_ACCESS;

  const ownerId = await loadOwnerId('knowledge_base', knowledgeBaseId);
  const grantsByResource = await loadGrantsForResources('knowledge_base', [knowledgeBaseId]);
  return permissionAtLevel(userId, ownerId, grantsByResource.get(knowledgeBaseId) ?? []);
}

export async function userHasChannelAccess(
  userId: string,
  channelId: string,
  required: ResourcePermissionLevel,
  preloaded?: Parameters<typeof resolveChannelPermission>[2],
): Promise<boolean> {
  const flags = await resolveChannelPermission(userId, channelId, preloaded);
  return satisfiesResourcePermission(flags, required);
}

export async function userHasKnowledgeBaseAccess(
  userId: string,
  knowledgeBaseId: string,
  required: ResourcePermissionLevel,
): Promise<boolean> {
  const flags = await resolveKnowledgeBasePermission(userId, knowledgeBaseId);
  return satisfiesResourcePermission(flags, required);
}

export async function resolveStudioAgentPermission(
  userId: string,
  studioAgentId: string,
): Promise<ResourcePermissionFlags> {
  if (await isPlatformAdmin(userId)) return FULL_RESOURCE_ACCESS;
  const ownerId = await loadOwnerId('studio_agent', studioAgentId);
  const grantsByResource = await loadGrantsForResources('studio_agent', [studioAgentId]);
  return permissionAtLevel(userId, ownerId, grantsByResource.get(studioAgentId) ?? []);
}

export async function userHasStudioAgentAccess(
  userId: string,
  studioAgentId: string,
  level: ResourcePermissionLevel,
): Promise<boolean> {
  const flags = await resolveStudioAgentPermission(userId, studioAgentId);
  return satisfiesResourcePermission(flags, level);
}

async function loadSkillRow(skillId: string) {
  const [row] = await db.select().from(appSkills).where(eq(appSkills.id, skillId)).limit(1);
  return row ?? null;
}

export async function resolveSkillPermission(
  userId: string,
  skillId: string,
): Promise<ResourcePermissionFlags> {
  const skill = await loadSkillRow(skillId);
  if (!skill) return NO_RESOURCE_ACCESS;
  if (await isPlatformAdmin(userId)) return FULL_RESOURCE_ACCESS;
  if (skill.origin === 'platform') {
    return { read: true, write: false, manage: false };
  }
  const grantsByResource = await loadGrantsForResources('skill', [skillId]);
  return permissionAtLevel(userId, skill.createdBy, grantsByResource.get(skillId) ?? []);
}

export async function userHasSkillAccess(
  userId: string,
  skillId: string,
  level: ResourcePermissionLevel,
): Promise<boolean> {
  const flags = await resolveSkillPermission(userId, skillId);
  return satisfiesResourcePermission(flags, level);
}

export async function listAccessibleChannelIds(userId: string): Promise<Set<string>> {
  if (await isPlatformAdmin(userId)) {
    const rows = await loadAllChannelRows();
    return new Set(rows.map((row) => row.id));
  }

  const channelRows = await loadAllChannelRows();
  const grantsByResource = await loadGrantsForResources(
    'document_channel',
    channelRows.map((row) => row.id),
  );
  const admin = false;
  const readable = new Set<string>();

  for (const row of channelRows) {
    const flags = await resolveChannelPermission(userId, row.id, {
      channelRows,
      grantsByResource,
      admin,
    });
    if (flags.read) readable.add(row.id);
  }

  return readable;
}

export async function listAccessibleKnowledgeBaseIds(userId: string): Promise<Set<string>> {
  if (await isPlatformAdmin(userId)) {
    const rows = await db.select({ id: appKnowledgeBases.id }).from(appKnowledgeBases);
    return new Set(rows.map((row) => row.id));
  }

  const rows = await db.select({ id: appKnowledgeBases.id }).from(appKnowledgeBases);
  const grantsByResource = await loadGrantsForResources(
    'knowledge_base',
    rows.map((row) => row.id),
  );
  const ownerRows = await db
    .select({ id: appKnowledgeBases.id, createdBy: appKnowledgeBases.createdBy })
    .from(appKnowledgeBases);

  const readable = new Set<string>();
  for (const row of ownerRows) {
    const flags = permissionAtLevel(userId, row.createdBy, grantsByResource.get(row.id) ?? []);
    if (flags.read) readable.add(row.id);
  }
  return readable;
}

export async function buildChannelTreeForUser(
  userId: string,
  tree: ChannelNode[],
): Promise<ChannelNodeWithAccess[]> {
  const readableIds = await listAccessibleChannelIds(userId);
  const channelRows = await loadAllChannelRows();
  const grantsByResource = await loadGrantsForResources(
    'document_channel',
    channelRows.map((row) => row.id),
  );
  const admin = await isPlatformAdmin(userId);

  const accessById = new Map<string, ResourcePermissionFlags>();
  for (const row of channelRows) {
    const flags = await resolveChannelPermission(userId, row.id, {
      channelRows,
      grantsByResource,
      admin,
    });
    accessById.set(row.id, flags);
  }

  return filterChannelTreeWithAccess(tree, readableIds, accessById);
}

async function loadUserSummary(userId: string): Promise<ResourceAccessUser | null> {
  const [row] = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      displayName: appUsers.displayName,
    })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export async function getResourceAccessSettings(
  resourceType: ResourceType,
  resourceId: string,
  viewerUserId: string,
): Promise<ResourceAccessSettings | null> {
  const ownerId = await loadOwnerId(resourceType, resourceId);
  if (ownerId === null && resourceType === 'document_channel') {
    const [exists] = await db
      .select({ id: appDocumentChannels.id })
      .from(appDocumentChannels)
      .where(eq(appDocumentChannels.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }
  if (ownerId === null && resourceType === 'audio_channel') {
    const [exists] = await db
      .select({ id: appAudioChannels.id })
      .from(appAudioChannels)
      .where(eq(appAudioChannels.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }
  if (ownerId === null && resourceType === 'knowledge_base') {
    const [exists] = await db
      .select({ id: appKnowledgeBases.id })
      .from(appKnowledgeBases)
      .where(eq(appKnowledgeBases.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }
  if (ownerId === null && resourceType === 'studio_agent') {
    const [exists] = await db
      .select({ id: appStudioAgents.id })
      .from(appStudioAgents)
      .where(eq(appStudioAgents.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }
  if (ownerId === null && resourceType === 'skill') {
    const [exists] = await db
      .select({ id: appSkills.id })
      .from(appSkills)
      .where(eq(appSkills.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }

  const grants = (await loadGrantsForResources(resourceType, [resourceId])).get(resourceId) ?? [];
  const othersGrant = grants.find((grant) => grant.granteeType === 'others');
  const userGrants = grants.filter((grant) => grant.granteeType === 'user' && grant.granteeUserId);

  const userIds = userGrants.map((grant) => grant.granteeUserId!).filter(Boolean);
  const userRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            id: appUsers.id,
            email: appUsers.email,
            displayName: appUsers.displayName,
          })
          .from(appUsers)
          .where(inArray(appUsers.id, userIds));

  const userById = new Map(userRows.map((row) => [row.id, row]));
  const users: ResourceAccessGrantRow[] = userGrants
    .map((grant) => {
      const user = userById.get(grant.granteeUserId!);
      if (!user) return null;
      const flags = flagsFromGrantRow(grant);
      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        ...flags,
      };
    })
    .filter((row): row is ResourceAccessGrantRow => row != null);

  const myAccess =
    resourceType === 'document_channel'
      ? await resolveChannelPermission(viewerUserId, resourceId)
      : resourceType === 'audio_channel'
        ? await (await import('./audio-resource-access.ts')).resolveAudioChannelPermission(
            viewerUserId,
            resourceId,
          )
        : resourceType === 'studio_agent'
        ? await resolveStudioAgentPermission(viewerUserId, resourceId)
        : resourceType === 'skill'
          ? await resolveSkillPermission(viewerUserId, resourceId)
        : await resolveKnowledgeBasePermission(viewerUserId, resourceId);

  return {
    owner: ownerId ? ((await loadUserSummary(ownerId)) ?? null) : null,
    others: othersGrant ? flagsFromGrantRow(othersGrant) : NO_RESOURCE_ACCESS,
    users,
    my_access: myAccess,
  };
}

export async function replaceResourceAccessSettings(
  resourceType: ResourceType,
  resourceId: string,
  actorUserId: string,
  input: ResourceAccessPutInput,
): Promise<ResourceAccessSettings> {
  const canManage =
    resourceType === 'document_channel'
      ? await userHasChannelAccess(actorUserId, resourceId, 'manage')
      : resourceType === 'audio_channel'
        ? await (await import('./audio-resource-access.ts')).userHasAudioChannelAccess(
            actorUserId,
            resourceId,
            'manage',
          )
        : resourceType === 'studio_agent'
        ? await userHasStudioAgentAccess(actorUserId, resourceId, 'manage')
        : resourceType === 'skill'
          ? await userHasSkillAccess(actorUserId, resourceId, 'manage')
        : await userHasKnowledgeBaseAccess(actorUserId, resourceId, 'manage');
  if (!canManage) throw new Error('Forbidden');

  const others = normalizeResourcePermissionFlags(input.others);
  const users = input.users.map((grant) => ({
    userId: grant.userId,
    ...normalizeResourcePermissionFlags(grant),
  }));

  const ownerId = await loadOwnerId(resourceType, resourceId);
  const filteredUsers = users.filter((grant) => grant.userId !== ownerId);

  await db.transaction(async (tx) => {
    await tx
      .delete(appResourceGrants)
      .where(and(eq(appResourceGrants.resourceType, resourceType), eq(appResourceGrants.resourceId, resourceId)));

    await tx.insert(appResourceGrants).values({
      resourceType,
      resourceId,
      granteeType: 'others',
      granteeUserId: null,
      canRead: others.read,
      canWrite: others.write,
      canManage: others.manage,
    });

    if (filteredUsers.length > 0) {
      await tx.insert(appResourceGrants).values(
        filteredUsers.map((grant) => ({
          resourceType,
          resourceId,
          granteeType: 'user' as const,
          granteeUserId: grant.userId,
          canRead: grant.read,
          canWrite: grant.write,
          canManage: grant.manage,
        })),
      );
    }
  });

  const settings = await getResourceAccessSettings(resourceType, resourceId, actorUserId);
  if (!settings) throw new Error('Resource not found');
  return settings;
}

export async function transferResourceOwner(
  resourceType: ResourceType,
  resourceId: string,
  actorUserId: string,
  newOwnerUserId: string,
): Promise<ResourceAccessSettings> {
  const canManage =
    resourceType === 'document_channel'
      ? await userHasChannelAccess(actorUserId, resourceId, 'manage')
      : resourceType === 'audio_channel'
        ? await (await import('./audio-resource-access.ts')).userHasAudioChannelAccess(
            actorUserId,
            resourceId,
            'manage',
          )
        : resourceType === 'studio_agent'
        ? await userHasStudioAgentAccess(actorUserId, resourceId, 'manage')
        : resourceType === 'skill'
          ? await userHasSkillAccess(actorUserId, resourceId, 'manage')
        : await userHasKnowledgeBaseAccess(actorUserId, resourceId, 'manage');
  if (!canManage) throw new Error('Forbidden');

  const [newOwner] = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.id, newOwnerUserId)).limit(1);
  if (!newOwner) throw new Error('User not found');

  if (resourceType === 'document_channel') {
    const [updated] = await db
      .update(appDocumentChannels)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appDocumentChannels.id, resourceId))
      .returning({ id: appDocumentChannels.id });
    if (!updated) throw new Error('Channel not found');
  } else if (resourceType === 'audio_channel') {
    const [updated] = await db
      .update(appAudioChannels)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appAudioChannels.id, resourceId))
      .returning({ id: appAudioChannels.id });
    if (!updated) throw new Error('Channel not found');
  } else if (resourceType === 'studio_agent') {
    const [updated] = await db
      .update(appStudioAgents)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appStudioAgents.id, resourceId))
      .returning({ id: appStudioAgents.id });
    if (!updated) throw new Error('Studio agent not found');
  } else if (resourceType === 'skill') {
    const [updated] = await db
      .update(appSkills)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appSkills.id, resourceId))
      .returning({ id: appSkills.id });
    if (!updated) throw new Error('Skill not found');
  } else {
    const [updated] = await db
      .update(appKnowledgeBases)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appKnowledgeBases.id, resourceId))
      .returning({ id: appKnowledgeBases.id });
    if (!updated) throw new Error('Knowledge base not found');
  }

  await db
    .delete(appResourceGrants)
    .where(
      and(
        eq(appResourceGrants.resourceType, resourceType),
        eq(appResourceGrants.resourceId, resourceId),
        eq(appResourceGrants.granteeType, 'user'),
        eq(appResourceGrants.granteeUserId, newOwnerUserId),
      ),
    );

  const settings = await getResourceAccessSettings(resourceType, resourceId, actorUserId);
  if (!settings) throw new Error('Resource not found');
  return settings;
}

export async function lookupUsersForSharing(search: string | undefined, limit = 20): Promise<ResourceAccessUser[]> {
  const trimmed = search?.trim();
  const conditions = trimmed
    ? or(ilike(appUsers.email, `%${trimmed}%`), ilike(appUsers.displayName, `%${trimmed}%`))
    : undefined;

  const rows = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      displayName: appUsers.displayName,
    })
    .from(appUsers)
    .where(conditions)
    .orderBy(asc(appUsers.email))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows;
}

export async function getDocumentChannelIdForDocument(documentId: string): Promise<string | null> {
  const { getDocumentById } = await import('../services/documents/documents.ts');
  const doc = await getDocumentById(documentId);
  return doc?.channelId ?? null;
}
